import { expect, it } from 'vitest';
import { PgLedgerPort } from '../../src/billing/pg-store.ts';
import { pgBillingEnv } from './pg-env.ts';

it('reload derives partial refunded credits from immutable entries before a later chargeback', async () => {
  const e = await pgBillingEnv();
  const wallet = await e.store.walletOf(e.userId);
  const port = new PgLedgerPort(e.db);
  const at = new Date('2026-10-26T00:00:00Z');
  await port.run(wallet, (l) => {
    l.grant({
      key: 'paid-partial',
      walletId: wallet,
      source: 'paket',
      credits: 300,
      originRef: 'order:partial',
      now: at,
    });
    l.reserve({ walletId: wallet, operationId: 'spend-partial', estimatedCredits: 100, now: at });
    l.settle({
      walletId: wallet,
      operationId: 'spend-partial',
      outcome: 'tamam',
      actualCredits: 100,
      now: at,
    });
    l.holdUnusedPackageCredits({
      walletId: wallet,
      operationId: 'deletion-partial',
      originRef: 'order:partial',
      now: at,
    });
    l.refundHeld({ walletId: wallet, operationId: 'deletion-partial', now: at });
  });
  const result = await port.run(wallet, (l) => {
    expect(l.wallet(wallet).lots[0]?.refundedCredits).toBe(200);
    l.clawback({
      key: 'later-chargeback',
      walletId: wallet,
      originRef: 'order:partial',
      reason: 'ters_ibraz',
      now: at,
    });
    return { balance: l.balance(wallet), debt: l.wallet(wallet).debt };
  });
  expect(result).toEqual({ balance: -100, debt: 100 });
  expect(await port.run(wallet, (l) => l.wallet(wallet).debt)).toBe(100);
  await e.pg.close();
}, 60000);
