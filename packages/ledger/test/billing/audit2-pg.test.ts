/** Re-audit findings on PGlite (repro2-pg.mts N1, N5, N6): the same flows through PgBillingStore. */
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { FakeEArsiv } from '../../src/billing/earsiv.ts';
import { FAKE_CFG, FakeIyzico } from '../../src/billing/fake-iyzico.ts';
import { PgLedgerPort } from '../../src/billing/pg-store.ts';
import { BillingService, type Buyer } from '../../src/billing/service.ts';
import { addDays } from '../../src/index.ts';
import { pgBillingEnv } from './pg-env.ts';

const buyer: Buyer = {
  id: 'u1',
  email: 'a@example.invalid',
  name: 'A',
  surname: 'B',
  identityNumber: '11111111111',
  ip: '127.0.0.1',
  city: 'Ankara',
  country: 'Turkey',
  address: 'x',
};
const pack = { preInfoConsentVersion: 'onb-1', distanceContractConsentVersion: 'mss-1' };
const plan = {
  preInfoConsentVersion: 'onb-1',
  distanceContractConsentVersion: 'abo-1',
  withdrawalWaiver: true,
  annualCommitmentVersion: 'abo-1',
};

async function env() {
  const base = await pgBillingEnv();
  let now = new Date('2026-10-20T09:00:00Z');
  const iyz = new FakeIyzico();
  iyz.now = () => now;
  const svc = new BillingService({
    iyzico: iyz,
    iyzicoCfg: FAKE_CFG,
    earsiv: new FakeEArsiv(() => now),
    store: base.store,
    ledger: new PgLedgerPort(base.db),
    consentVersions: { on_bilgilendirme: 'onb-1', mesafeli_sozlesme: 'mss-1', abonelik_sozlesmesi: 'abo-1' },
    now: () => now,
    newId: randomUUID,
    callbackBaseUrl: 'https://k.test',
    webAddress: 'https://k.test',
  });
  await svc.setupSubscriptionCatalog();
  return {
    ...base,
    iyz,
    svc,
    set: (d: Date) => {
      now = d;
    },
    get now() {
      return now;
    },
  };
}

it('Y-N1 on Postgres: refund row before the iyzico cancel, refunded once on retry', async () => {
  const e = await env();
  const s = await e.svc.startSubscription(
    e.userId,
    randomUUID(),
    { planCode: 'ogrenci.yillik', ...plan },
    buyer,
  );
  const sub = await e.svc.completeSubscriptionCheckout(
    (await e.store.getOrder(s.orderId))?.checkoutToken as string,
  );
  e.iyz.failNextCancel = 'unknown';
  await expect(e.svc.cancel(e.userId, sub.id, 'hemen')).rejects.toMatchObject({ code: 'cancel_failed' });
  expect((await e.pg.query("select status from payments where kind = 'iade'")).rows).toEqual([
    { status: 'hazir' },
  ]);
  await e.svc.reconcileCancellations();
  expect((await e.pg.query("select status from payments where kind = 'iade'")).rows).toEqual([
    { status: 'basarili' },
  ]);
  expect(e.iyz.refunds).toHaveLength(1);
  await e.pg.close();
}, 60_000);

it('O-N1 on Postgres: credits stay locked across days until the administrator resolves the refund', async () => {
  const e = await env();
  const a = await e.svc.startTopup(
    e.userId,
    randomUUID(),
    { productCode: 'kredi.300', withdrawalWaiver: true, ...pack },
    buyer,
  );
  await e.svc.completeCheckout((await e.store.getOrder(a.orderId))?.checkoutToken as string);
  e.iyz.nextRefund = 'unknown';
  await expect(e.svc.requestRefund(e.userId, a.orderId)).rejects.toMatchObject({ code: 'refund_pending' });
  e.set(addDays(e.now, 2));
  expect((await e.svc.wallet(e.userId)).balance).toBe(0);
  const [p] = await e.svc.listPendingRefunds();
  await e.svc.resolvePendingRefund(p?.refundRef as string, 'basarili');
  expect((await e.store.getOrder(a.orderId))?.status).toBe('iade_edildi');
  expect((await e.pg.query('select status from refund_requests')).rows).toEqual([{ status: 'tamamlandi' }]);
  await e.pg.close();
}, 60_000);

it('Y-N4 on Postgres: the first order webhook opens a subscription whose callback never came', async () => {
  const e = await env();
  const s = await e.svc.startSubscription(
    e.userId,
    randomUUID(),
    { planCode: 'ogrenci.aylik', ...plan },
    buyer,
  );
  const r = await e.iyz.retrieveSubscriptionCheckout(
    (await e.store.getOrder(s.orderId))?.checkoutToken as string,
  );
  const wh = e.iyz.initialOrderWebhook(r.subscriptionReferenceCode as string);
  expect((await e.svc.handleWebhook(JSON.stringify(wh.body), wh.signature)).status).toBe(200);
  expect((await e.pg.query('select count(*)::int n from subscriptions')).rows).toEqual([{ n: 1 }]);
  expect((await e.svc.wallet(e.userId)).balance).toBe(1000);
  await e.pg.close();
}, 60_000);
