import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ACCOUNTS, Ledger, LedgerError, isBalanced } from '../src/index.ts';

const W = 'w1';
const T0 = Date.UTC(2026, 9, 19);

type Cmd =
  | {
      t: 'grant';
      source: 'promosyon' | 'abonelik' | 'paket' | 'iap';
      credits: number;
      ref: number;
      dup: boolean;
    }
  | { t: 'reserve'; op: number; est: number }
  | { t: 'settle'; op: number; outcome: 'tamam' | 'cekimser' | 'teknik_hata'; actual: number }
  | { t: 'advance'; minutes: number }
  | { t: 'sweep' }
  | { t: 'refund'; ref: number }
  | { t: 'clawback'; ref: number; reason: 'ters_ibraz' | 'apple_iade' }
  | { t: 'expire' };

const cmd: fc.Arbitrary<Cmd> = fc.oneof(
  fc.record({
    t: fc.constant('grant' as const),
    source: fc.constantFrom('promosyon', 'abonelik', 'paket', 'iap'),
    credits: fc.integer({ min: 1, max: 3000 }),
    ref: fc.integer({ min: 0, max: 8 }),
    dup: fc.boolean(),
  }),
  fc.record({
    t: fc.constant('reserve' as const),
    op: fc.integer({ min: 0, max: 8 }),
    est: fc.integer({ min: 1, max: 200 }),
  }),
  fc.record({
    t: fc.constant('settle' as const),
    op: fc.integer({ min: 0, max: 8 }),
    outcome: fc.constantFrom('tamam', 'cekimser', 'teknik_hata'),
    actual: fc.integer({ min: 0, max: 300 }),
  }),
  fc.record({ t: fc.constant('advance' as const), minutes: fc.integer({ min: 1, max: 60 * 24 * 40 }) }),
  fc.constant({ t: 'sweep' as const }),
  fc.record({ t: fc.constant('refund' as const), ref: fc.integer({ min: 0, max: 8 }) }),
  fc.record({
    t: fc.constant('clawback' as const),
    ref: fc.integer({ min: 0, max: 8 }),
    reason: fc.constantFrom('ters_ibraz', 'apple_iade'),
  }),
  fc.constant({ t: 'expire' as const }),
);

function run(cmds: Cmd[]) {
  let n = 0;
  const l = new Ledger({ newId: () => `id-${++n}` });
  let now = T0;
  const events: string[] = [];
  for (const c of cmds) {
    const at = new Date(now);
    const before = l.txs.length;
    try {
      switch (c.t) {
        case 'grant': {
          const key = `grant:${c.ref}`;
          l.grant({
            key,
            walletId: W,
            source: c.source,
            credits: c.credits,
            originRef: `ref-${c.ref}`,
            now: at,
          });
          if (c.dup) {
            const len = l.txs.length;
            l.grant({
              key,
              walletId: W,
              source: c.source,
              credits: c.credits,
              originRef: `ref-${c.ref}`,
              now: at,
            });
            expect(l.txs.length).toBe(len);
          }
          break;
        }
        case 'reserve':
          l.reserve({ operationId: `op-${c.op}`, walletId: W, estimatedCredits: c.est, now: at });
          break;
        case 'settle':
          l.settle({
            walletId: W,
            operationId: `op-${c.op}`,
            outcome: c.outcome,
            actualCredits: c.actual,
            now: at,
          });
          break;
        case 'advance':
          now += c.minutes * 60_000;
          break;
        case 'sweep':
          l.sweepExpired(W, at);
          break;
        case 'refund':
          l.refundUnusedLot({ key: `refund:${c.ref}`, walletId: W, originRef: `ref-${c.ref}`, now: at });
          break;
        case 'clawback':
          l.clawback({
            key: `cb:${c.ref}`,
            walletId: W,
            originRef: `ref-${c.ref}`,
            reason: c.reason,
            now: at,
          });
          events.push('clawback');
          break;
        case 'expire':
          l.expirePromos(W, at);
          break;
      }
    } catch (e) {
      if (!(e instanceof LedgerError)) throw e;
      // A rejected command writes at most the release of an expired reservation.
      expect(l.txs.length - before).toBeLessThanOrEqual(1);
    }
    check(l, events);
  }
  return { l, now };
}

function check(l: Ledger, events: string[]) {
  const w = l.wallet(W);
  // Every transaction balances and has a unique key.
  for (const tx of l.txs) expect(isBalanced(tx.entries)).toBe(true);
  expect(new Set(l.txs.map((t) => t.idempotencyKey)).size).toBe(l.txs.length);
  // Total balance equals the sum of movements on the wallet account.
  expect(l.accountBalance(ACCOUNTS.wallet(W))).toBe(l.balance(W));
  // Held credits equal the open reservations.
  expect(l.accountBalance(ACCOUNTS.reserve(W))).toBe(l.reserved(W));
  // Lots stay within bounds.
  for (const lot of w.lots) {
    expect(lot.remainingCredits).toBeGreaterThanOrEqual(0);
    expect(lot.remainingCredits).toBeLessThanOrEqual(lot.originalCredits);
  }
  // Negative balance only after a clawback.
  if (l.balance(W) < 0 || w.debt > 0) expect(events).toContain('clawback');
  // Whole system sums to zero (closed double entry).
  const codes = new Set(l.txs.flatMap((t) => t.entries.map((e) => e.accountCode)));
  let total = 0;
  for (const c of codes) total += l.accountBalance(c);
  expect(total).toBe(0);
}

describe('ledger invariants (fast-check)', () => {
  it('holds balance, idempotency and lot bounds over random command sequences', () => {
    fc.assert(
      fc.property(fc.array(cmd, { maxLength: 60 }), (cmds) => {
        run(cmds);
      }),
      { numRuns: 400 },
    );
  });

  it('settles every reservation: consumed or released, never left open after expiry and a sweep', () => {
    fc.assert(
      fc.property(fc.array(cmd, { maxLength: 60 }), (cmds) => {
        const { l, now } = run(cmds);
        l.sweepExpired(W, new Date(now + 5 * 60_000 + 1));
        for (const r of l.wallet(W).reservations) {
          expect(['tuketildi', 'cozuldu']).toContain(r.status);
          const consumed = r.status === 'tuketildi' ? (r.actualCredits ?? 0) : 0;
          expect(consumed).toBeLessThanOrEqual(r.estimatedCredits);
        }
        expect(l.reserved(W)).toBe(0);
        expect(l.accountBalance(ACCOUNTS.reserve(W))).toBe(0);
      }),
      { numRuns: 300 },
    );
  });

  it('processes the same event once, whatever the replay count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 2, max: 6 }), (credits, times) => {
        const l = new Ledger();
        for (let i = 0; i < times; i++)
          l.grant({
            key: 'iyzico:evt-1',
            walletId: W,
            source: 'paket',
            credits,
            originRef: 'pay-1',
            now: new Date(T0),
          });
        expect(l.txs.length).toBe(1);
        expect(l.balance(W)).toBe(credits);
      }),
    );
  });
});
