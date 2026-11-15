/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { describe, expect, it } from 'vitest';
import {
  BudgetGuard,
  FakeLedger,
  MemoryCounterStore,
  ProviderSwitch,
  ReservationError,
  createAdapters,
  createGateway,
  type CostEvent,
  type GatewayEvent,
  type GatewayMetric,
  type LedgerReservations,
  type SettlementFailure,
} from '../src/index.ts';
import { fakeAdapter, passage } from './helpers.ts';

/**
 * review.md P8.5: a consume or release failure at the end of the stream used to escape the generator's finally.
 * The user lost the end of a finished summary, no cost event or metric was written and the platform spend
 * counter missed a paid call. Cost events must match what the ledger really recorded.
 */

type Step = 'ok' | 'fail' | 'commit_then_fail' | 'expired';

/** FakeLedger with scripted consume and release outcomes; a settled hold answers already_settled like packages/ledger. */
class ScriptedLedger implements LedgerReservations {
  readonly inner = new FakeLedger();
  consumeCalls = 0;
  releaseCalls = 0;
  constructor(private readonly script: { consume?: Step[]; release?: Step[] } = {}) {}
  reserve(input: { userId: string; credits: number; idempotencyKey: string }) {
    return this.inner.reserve(input);
  }
  private async step(kind: 'consume' | 'release', id: string, credits: number): Promise<void> {
    const n = kind === 'consume' ? this.consumeCalls++ : this.releaseCalls++;
    const s = this.script[kind]?.[n] ?? 'ok';
    if (this.inner.reservations.get(id)?.state !== 'held') throw new ReservationError('already_settled');
    if (s === 'fail') throw new Error('connection reset');
    if (s === 'expired') throw Object.assign(new Error('expired'), { code: 'reservation_expired' });
    if (kind === 'consume') await this.inner.consume(id, credits);
    else await this.inner.release(id);
    if (s === 'commit_then_fail') throw new Error('reply lost');
  }
  consume(id: string, credits: number) {
    return this.step('consume', id, credits);
  }
  release(id: string) {
    return this.step('release', id, 0);
  }
  /** Credits the ledger really took. */
  charged(): number {
    return [...this.inner.reservations.values()].reduce((a, r) => a + r.charged, 0);
  }
}

const OK = [
  '{"t":"cumle","metin":"Kira tespiti davası açılabilir.","kaynaklar":["K1"],"alinti":{"K1":"kira bedelinin tespiti"}}\n',
  '{"t":"son"}\n',
];
const ABSTAIN = ['{"t":"yetersiz","neden":"x"}\n', '{"t":"son"}\n'];

function setup(ledger: LedgerReservations, lines = OK, spendFails = false) {
  const metrics: GatewayMetric[] = [];
  const costs: CostEvent[] = [];
  const failures: SettlementFailure[] = [];
  const budget = new BudgetGuard(new MemoryCounterStore());
  if (spendFails)
    budget.recordSpendTl = () => {
      throw new Error('valkey down');
    };
  const gw = createGateway({
    adapters: {
      ...createAdapters({ fetch: () => Promise.reject(new Error('no network in tests')) }),
      openrouter: fakeAdapter('openrouter', lines),
    },
    budget,
    switches: new ProviderSwitch(['openrouter']),
    ledger,
    platformKeys: { openrouter: 'pk-o' },
    sink: (m) => metrics.push(m),
    onCost: (c) => costs.push(c),
    onSettleFailure: (f) => failures.push(f),
  });
  return { gw, metrics, costs, failures };
}

const input = (requestId: string) => ({
  requestId,
  operation: 'ozet' as const,
  mode: 'platform' as const,
  userId: 'u',
  userHash: 'uh',
  ipHash: 'ih',
  credits: 2,
  free: false,
  question: 'Kira tespiti davası açılabilir mi?',
  passages: [passage('K1', 'Uyuşmazlık kira bedelinin tespiti ile ilgilidir.')],
});

async function collect(it: AsyncIterable<GatewayEvent>): Promise<GatewayEvent[]> {
  const out: GatewayEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('settlement errors never break a finished stream (review.md P8.5)', () => {
  it('a transient consume failure is retried once and then charged', async () => {
    const ledger = new ScriptedLedger({ consume: ['fail'] });
    const { gw, costs, failures } = setup(ledger);
    const events = await collect(gw.run(input('r1')));
    expect(events.at(-1)).toMatchObject({ t: 'bitti', cost: { creditsCharged: 2, settlement: 'ok' } });
    expect(ledger.consumeCalls).toBe(2);
    expect(costs[0]!.creditsCharged).toBe(ledger.charged());
    expect(failures).toEqual([]);
  });

  it('a consume that keeps failing: the summary still ends, nothing is charged, the operator is alerted', async () => {
    const ledger = new ScriptedLedger({ consume: ['fail', 'fail'] });
    const { gw, costs, metrics, failures } = setup(ledger);
    const events = await collect(gw.run(input('r2')));
    expect(events.filter((e) => e.t === 'satir')).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ t: 'bitti', abstained: false });
    expect(costs[0]).toMatchObject({ creditsCharged: 0, creditsDue: 2, settlement: 'failed' });
    expect(ledger.charged()).toBe(0);
    expect(failures).toEqual([
      {
        requestId: 'r2',
        reservationId: costs[0]!.reservationId,
        action: 'consume',
        credits: 2,
        errorKind: 'Error',
      },
    ]);
    expect(metrics[0]).toMatchObject({ outcome: 'ok', errorKind: 'ledger_Error' });
    // The platform still paid the provider, so the spend counter was updated before settlement.
    expect(costs[0]!.costUsd).toBeGreaterThan(0);
  });

  it('a lost reply after a committed consume is not charged twice', async () => {
    const ledger = new ScriptedLedger({ consume: ['commit_then_fail'] });
    const { gw, costs } = setup(ledger);
    await collect(gw.run(input('r3')));
    expect(ledger.consumeCalls).toBe(2);
    expect(costs[0]).toMatchObject({ creditsCharged: 2, settlement: 'ok' });
    expect(ledger.charged()).toBe(2);
  });

  it('a typed ledger answer (expired hold) is final and not retried', async () => {
    const ledger = new ScriptedLedger({ consume: ['expired'] });
    const { gw, costs, failures } = setup(ledger);
    await collect(gw.run(input('r4')));
    expect(ledger.consumeCalls).toBe(1);
    expect(costs[0]).toMatchObject({ creditsCharged: 0, creditsDue: 2, settlement: 'failed' });
    expect(failures[0]).toMatchObject({ action: 'consume', errorKind: 'reservation_expired' });
  });

  it('a failing release after an abstention still ends the stream', async () => {
    const ledger = new ScriptedLedger({ release: ['fail', 'fail'] });
    const { gw, costs, failures } = setup(ledger, ABSTAIN);
    const events = await collect(gw.run(input('r5')));
    expect(events.at(-1)).toMatchObject({ t: 'bitti', abstained: true });
    expect(costs[0]).toMatchObject({ creditsCharged: 0, creditsDue: 0, settlement: 'failed' });
    expect(failures[0]).toMatchObject({ action: 'release', credits: 0 });
  });

  it('a failing spend counter does not lose the cost event or the charge', async () => {
    const ledger = new ScriptedLedger();
    const { gw, costs, metrics } = setup(ledger, OK, true);
    const events = await collect(gw.run(input('r6')));
    expect(events.at(-1)?.t).toBe('bitti');
    expect(costs[0]).toMatchObject({ creditsCharged: 2, settlement: 'ok' });
    expect(metrics[0]!.errorKind).toBe('budget_spend_failed');
  });

  it('across mixed outcomes the cost events add up to exactly what the ledger recorded', async () => {
    const ledger = new ScriptedLedger({
      consume: ['ok', 'fail', 'fail', 'commit_then_fail', 'ok', 'expired'],
    });
    const { gw, costs } = setup(ledger);
    for (let i = 0; i < 5; i++) await collect(gw.run(input(`mix-${i}`)));
    const sum = costs.reduce((a, c) => a + c.creditsCharged, 0);
    expect(sum).toBe(ledger.charged());
    expect(costs.map((c) => c.settlement)).toEqual(['ok', 'failed', 'ok', 'failed', 'ok']);
  });
});
