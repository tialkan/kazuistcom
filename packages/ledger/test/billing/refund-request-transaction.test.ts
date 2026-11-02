import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgLedgerPort } from '../../src/billing/pg-store.ts';
import { pgBillingEnv } from './pg-env.ts';
it('rolls back an account-refund hold and request changes together', async () => {
  const e = await pgBillingEnv();
  const id = randomUUID();
  const wallet = await e.store.walletOf(e.userId);
  const ledger = new PgLedgerPort(e.db);
  const at = new Date('2026-10-26T00:00:00Z');
  await e.store.createRefundRequest({
    id,
    userId: e.userId,
    orderId: null,
    subscriptionId: null,
    reason: 'hesap_silme:300_kredi',
    amountKurus: null,
    status: 'bekliyor',
  });
  await ledger.run(wallet, (l) =>
    l.grant({
      key: 'paid-tx',
      walletId: wallet,
      source: 'paket',
      credits: 300,
      originRef: 'order:tx',
      now: at,
    }),
  );
  await expect(
    e.store.withRefundRequestTransaction(id, ledger, async (store, boundLedger) => {
      await boundLedger.run(wallet, (l) =>
        l.holdUnusedPackageCredits({
          walletId: wallet,
          operationId: 'tx-hold',
          originRef: 'order:tx',
          now: at,
        }),
      );
      await store.alert('test_refund_transaction', { id });
      throw new Error('abort before approval');
    }),
  ).rejects.toThrow('abort before approval');
  expect(
    await ledger.run(wallet, (l) => ({ balance: l.balance(wallet), reserved: l.reserved(wallet) })),
  ).toEqual({ balance: 300, reserved: 0 });
  const audit = await e.pg.query<{ count: number }>(
    "select count(*)::int as count from audit_log where action='billing.test_refund_transaction'",
  );
  expect(audit.rows[0]?.count).toBe(0);
  await e.pg.close();
}, 60000);
