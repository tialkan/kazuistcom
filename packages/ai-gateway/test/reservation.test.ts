import { describe, expect, it } from 'vitest';
import {
  BudgetGuard,
  FakeLedger,
  MemoryCounterStore,
  ProviderSwitch,
  ReservationError,
  createAdapters,
  createGateway,
  type GatewayEvent,
  type LedgerReservations,
  type RunInput,
} from '../src/index.ts';
import { fakeAdapter, passage } from './helpers.ts';

const OK = [
  '{"t":"cumle","metin":"X.","kaynaklar":["K1"],"alinti":{"K1":"kira bedelinin tespiti"}}\n',
  '{"t":"son"}\n',
];
const DAY_KEY = 'credits:user:uh:2026-10-21';

function setup(ledger: LedgerReservations) {
  const store = new MemoryCounterStore();
  const a = fakeAdapter('anthropic', OK, { usage: [10, 10] });
  const gw = createGateway({
    adapters: {
      ...createAdapters({ fetch: () => Promise.reject(new Error('no network')) }),
      anthropic: a,
    },
    budget: new BudgetGuard(store, undefined, () => new Date('2026-10-21T12:00:00Z')),
    switches: new ProviderSwitch(['anthropic']),
    ledger,
    platformKeys: { anthropic: 'pk-a' },
    sink: () => undefined,
  });
  return { gw, store, a };
}

const input = (requestId: string): RunInput => ({
  requestId,
  operation: 'ozet',
  mode: 'platform',
  userId: 'u',
  userHash: 'uh',
  ipHash: 'ih',
  credits: 2,
  free: false,
  question: 'kira tespiti?',
  passages: [passage('K1', 'Uyuşmazlık kira bedelinin tespiti ile ilgilidir.')],
});

async function drain(it: AsyncIterable<GatewayEvent>): Promise<GatewayEvent[]> {
  const out: GatewayEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('reservation failures (audit Y7)', () => {
  it('fake ledger throws typed errors like the real adapter', async () => {
    const l = new FakeLedger(Date.now, 1);
    await expect(l.reserve({ userId: 'u', credits: 2, idempotencyKey: 'k' })).rejects.toMatchObject({
      code: 'insufficient_credits',
    });
    l.setBalance('u', 5);
    const r = await l.reserve({ userId: 'u', credits: 2, idempotencyKey: 'k' });
    await l.consume(r.reservationId, 2);
    const err = await l.reserve({ userId: 'u', credits: 2, idempotencyKey: 'k' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReservationError);
    expect((err as ReservationError).code).toBe('already_settled');
  });

  it('insufficient credits: 402, slot and daily counter rolled back, top-up unblocks', async () => {
    const ledger = new FakeLedger(Date.now, 0);
    const { gw, store, a } = setup(ledger);
    for (const id of ['r1', 'r2', 'r3']) {
      const e = await drain(gw.run(input(id))).catch((x: unknown) => x);
      expect(e).toMatchObject({ status: 402, code: 'insufficient_credits' });
    }
    expect(a.calls).toHaveLength(0);
    expect(await store.get(DAY_KEY)).toBe(0);
    ledger.setBalance('u', 100);
    const ev = await drain(gw.run(input('r9')));
    expect(ev.at(-1)).toMatchObject({ t: 'bitti', cost: { creditsCharged: 2 } });
  });

  it('a second run with the same requestId after settlement is not free', async () => {
    const ledger = new FakeLedger(Date.now, 100);
    const { gw, a, store } = setup(ledger);
    await drain(gw.run(input('same')));
    const e = await drain(gw.run(input('same'))).catch((x: unknown) => x);
    expect(e).toMatchObject({ status: 409, code: 'conflict' });
    expect(a.calls).toHaveLength(1);
    expect(await store.get(DAY_KEY)).toBe(2);
    await expect(drain(gw.run(input('next')))).resolves.toBeDefined();
  });

  it('an unknown reserve failure also releases the slot', async () => {
    const ledger = new FakeLedger(Date.now, 100);
    ledger.reserve = () => Promise.reject(new Error('db down'));
    const { gw } = setup(ledger);
    for (const id of ['a', 'b', 'c'])
      await expect(drain(gw.run(input(id)))).rejects.toMatchObject({ status: 503 });
  });
});

describe('real packages/ledger adapter (audit repro-gateway.mts)', () => {
  it('empty wallet: typed 402 each time, then a top-up runs', async () => {
    const { Ledger, LedgerReservationsAdapter, memoryRunner } = await import('@kazuist/ledger');
    const ledger = new Ledger();
    const { gw } = setup(new LedgerReservationsAdapter(memoryRunner(ledger), () => 'w-empty'));
    for (const id of ['req-1', 'req-2', 'req-3']) {
      const e = await drain(gw.run(input(id))).catch((x: unknown) => x);
      expect(e).toMatchObject({ status: 402, code: 'insufficient_credits' });
    }
    ledger.grant({
      key: 'g',
      walletId: 'w-empty',
      source: 'paket',
      credits: 100,
      originRef: 'o',
      now: new Date(),
    });
    const ev = await drain(gw.run(input('req-9')));
    expect(ev.at(-1)).toMatchObject({ t: 'bitti', cost: { creditsCharged: 2 } });
  });

  it('same requestId after settlement: already_settled from the real ledger, charged once', async () => {
    const { Ledger, LedgerReservationsAdapter, memoryRunner } = await import('@kazuist/ledger');
    const ledger = new Ledger();
    ledger.grant({ key: 'g', walletId: 'w', source: 'paket', credits: 100, originRef: 'o', now: new Date() });
    const { gw, a } = setup(new LedgerReservationsAdapter(memoryRunner(ledger), () => 'w'));
    await drain(gw.run(input('same')));
    const e = await drain(gw.run(input('same'))).catch((x: unknown) => x);
    expect(e).toMatchObject({ status: 409, code: 'conflict' });
    expect(a.calls).toHaveLength(1);
    expect(ledger.balance('w')).toBe(98);
  });
});
