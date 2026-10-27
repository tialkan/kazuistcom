import { expect, it } from 'vitest';
import { Ledger, LedgerError, ACCOUNTS } from '../src/index.ts';
const at = new Date('2026-10-26T00:00:00Z');
function usedPackage() {
  const ledger = new Ledger();
  ledger.grant({ key: 'paid', walletId: 'w', source: 'paket', credits: 300, originRef: 'order:o', now: at });
  ledger.reserve({ walletId: 'w', operationId: 'spent', estimatedCredits: 100, now: at });
  ledger.settle({ walletId: 'w', operationId: 'spent', outcome: 'tamam', actualCredits: 100, now: at });
  return ledger;
}
it('holds only unused package credits, refunds them once and preserves spent-credit chargeback accounting', () => {
  const l = usedPackage();
  const hold = l.holdUnusedPackageCredits({
    walletId: 'w',
    operationId: 'deletion-refund',
    originRef: 'order:o',
    now: at,
  });
  expect(hold.estimatedCredits).toBe(200);
  expect(l.balance('w')).toBe(0);
  expect(l.reserved('w')).toBe(200);
  const first = l.refundHeld({ walletId: 'w', operationId: 'deletion-refund', now: at });
  expect(l.refundHeld({ walletId: 'w', operationId: 'deletion-refund', now: at })).toEqual(first);
  expect(l.wallet('w').lots[0]?.refundedCredits).toBe(200);
  l.clawback({ key: 'chargeback', walletId: 'w', originRef: 'order:o', reason: 'ters_ibraz', now: at });
  expect(l.balance('w')).toBe(-100);
  expect(l.wallet('w').debt).toBe(100);
  expect(l.accountBalance(ACCOUNTS.reserve('w'))).toBe(0);
});
it('does not refund a package that still funds an open work reservation', () => {
  const l = usedPackage();
  l.reserve({ walletId: 'w', operationId: 'inflight', estimatedCredits: 1, now: at });
  expect(() =>
    l.holdUnusedPackageCredits({
      walletId: 'w',
      operationId: 'deletion-refund',
      originRef: 'order:o',
      now: at,
    }),
  ).toThrow(LedgerError);
  expect(l.balance('w')).toBe(199);
});
it('deletion partial holds never accept promotional credits', () => {
  const l = new Ledger();
  l.grant({ key: 'promo', walletId: 'w', source: 'promosyon', credits: 300, originRef: 'promo', now: at });
  expect(() =>
    l.holdUnusedPackageCredits({
      walletId: 'w',
      operationId: 'deletion-refund',
      originRef: 'promo',
      now: at,
    }),
  ).toThrow(LedgerError);
});
