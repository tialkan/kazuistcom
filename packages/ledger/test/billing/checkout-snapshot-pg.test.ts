import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { BillingService } from '../../src/billing/service.ts';
import { PgLedgerPort } from '../../src/billing/pg-store.ts';
import { FakeIyzico, FAKE_CFG } from '../../src/billing/fake-iyzico.ts';
import { FakeEArsiv } from '../../src/billing/earsiv.ts';
import { pgBillingEnv } from './pg-env.ts';

async function env(badHash = false, refusePreparation = false) {
  const e = await pgBillingEnv();
  const iyz = new FakeIyzico();
  const buyer = {
    id: e.userId,
    name: 'A',
    surname: 'B',
    email: 'a@example.invalid',
    identityNumber: '11111111111',
    ip: '127.0.0.1',
    city: 'Ankara',
    country: 'Turkey',
    address: 'Test',
  };
  const svc = new BillingService({
    iyzico: iyz,
    iyzicoCfg: FAKE_CFG,
    earsiv: new FakeEArsiv(),
    store: e.store,
    ledger: new PgLedgerPort(e.db),
    now: () => new Date('2026-10-25T10:00:00Z'),
    newId: randomUUID,
    callbackBaseUrl: 'https://k.test',
    webAddress: 'https://k.test',
    prepareLegalDocuments: (order) => {
      if (refusePreparation) throw new Error('legal preflight refused');
      return [
        {
          slug: 'on-bilgilendirme',
          version: String(order.consentVersions.preInfo),
          text: 'Frozen info',
          sha256: createHash('sha256').update('Frozen info').digest('hex'),
          fields: { ALICI_AD: 'A B' },
        },
        {
          slug: order.productCode.startsWith('kredi.') ? 'mesafeli-satis' : 'abonelik',
          version: String(order.consentVersions.distance),
          text: 'Frozen contract',
          sha256: badHash ? '0'.repeat(64) : createHash('sha256').update('Frozen contract').digest('hex'),
          fields: { ALICI_AD: 'A B' },
        },
      ];
    },
  });
  return {
    ...e,
    iyz,
    svc,
    buyer,
    buy: () =>
      svc.startTopup(
        e.userId,
        randomUUID(),
        {
          productCode: 'kredi.300',
          withdrawalWaiver: true,
          preInfoConsentVersion: 'onb',
          distanceContractConsentVersion: 'mss',
        },
        buyer,
      ),
  };
}
it('checkout persists its order, complete frozen document set and consents together', async () => {
  const e = await env();
  const a = await e.buy();
  const docs = await e.pg.query('select * from order_legal_documents where order_id=$1', [a.orderId]);
  expect(docs.rows).toHaveLength(2);
  const consents = await e.pg.query("select * from consents where context->>'orderId'=$1", [a.orderId]);
  expect(consents.rows).toHaveLength(3);
  await e.pg.close();
}, 60000);
it('invalid snapshot rolls back the order and every consent', async () => {
  const e = await env(true);
  await expect(e.buy()).rejects.toThrow();
  for (const table of ['orders', 'consents', 'order_legal_documents']) {
    const result = await e.pg.query<{ count: number }>(`select count(*)::int as count from ${table}`);
    expect(result.rows[0]?.count).toBe(0);
  }
  await e.pg.close();
}, 60000);
it('account deletion false cancels live subscriptions without creating a refund, including recovery', async () => {
  const e = await env();
  const packageOrder = await e.buy();
  await e.svc.completeCheckout((await e.store.getOrder(packageOrder.orderId))?.checkoutToken as string);
  await e.svc.setupSubscriptionCatalog();
  const s = await e.svc.startSubscription(
    e.userId,
    randomUUID(),
    {
      planCode: 'ogrenci.aylik',
      withdrawalWaiver: true,
      preInfoConsentVersion: 'onb',
      distanceContractConsentVersion: 'abo',
    },
    e.buyer,
  );
  const sub = await e.svc.completeSubscriptionCheckout(
    (await e.store.getOrder(s.orderId))?.checkoutToken as string,
  );
  await e.pg.query('update users set deleted_at=now(),deletion_request_refund=false where id=$1', [e.userId]);
  expect(await e.svc.reconcileDeletedAccounts()).toBe(1);
  expect((await e.store.getSubscription(sub.id))?.status).toBe('iptal');
  expect(await e.store.listRefundRequests(e.userId)).toHaveLength(0);
  expect(await e.svc.reconcileDeletedAccounts()).toBe(0);
  await e.pg.close();
}, 60000);

it('a failed legal preflight never opens an external checkout', async () => {
  const e = await env(false, true);
  await expect(e.buy()).rejects.toThrow('legal preflight refused');
  expect(e.iyz.checkouts.size).toBe(0);
  await e.pg.close();
}, 60000);
it('subscription checkout persists its own complete document set and all accepted consents', async () => {
  const e = await env();
  await e.svc.setupSubscriptionCatalog();
  const a = await e.svc.startSubscription(
    e.userId,
    randomUUID(),
    {
      planCode: 'ogrenci.yillik',
      withdrawalWaiver: true,
      preInfoConsentVersion: 'onb',
      distanceContractConsentVersion: 'abo',
      annualCommitmentVersion: 'abo',
    },
    e.buyer,
  );
  const docs = await e.pg.query<{ slug: string; version: string }>(
    'select slug,version from order_legal_documents where order_id=$1 order by slug',
    [a.orderId],
  );
  expect(docs.rows).toEqual([
    { slug: 'abonelik', version: 'abo' },
    { slug: 'on-bilgilendirme', version: 'onb' },
  ]);
  const consents = await e.pg.query<{ count: number }>(
    "select count(*)::int as count from consents where context->>'orderId'=$1",
    [a.orderId],
  );
  expect(consents.rows[0]?.count).toBe(4);
  await e.pg.close();
}, 60000);
it('explicit deletion false preserves unused paid credits and never creates a refund request', async () => {
  const e = await env();
  const a = await e.buy();
  await e.svc.completeCheckout((await e.store.getOrder(a.orderId))?.checkoutToken as string);
  const result = await e.svc.onAccountDeletion(e.userId, { requestRefund: false });
  expect(result.refundRequested).toBe(false);
  expect(await e.store.listRefundRequests(e.userId)).toHaveLength(0);
  expect((await e.svc.wallet(e.userId)).balance).toBe(300);
  await e.pg.close();
}, 60000);
