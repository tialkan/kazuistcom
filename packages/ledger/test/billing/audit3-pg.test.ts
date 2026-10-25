/** Third audit on PGlite (repro3-pg.mts R1, R4; O9 retry over the users table). */
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { FakeEArsiv } from '../../src/billing/earsiv.ts';
import { FAKE_CFG, FakeIyzico } from '../../src/billing/fake-iyzico.ts';
import { PgBillingStore, PgLedgerPort } from '../../src/billing/pg-store.ts';
import { BillingService, type Buyer } from '../../src/billing/service.ts';
import { PRICE_TABLE_V1, addDays } from '../../src/index.ts';
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

it('Y-N5 on Postgres: a long fraud review stays inceleniyor and the IFN by paymentId credits it', async () => {
  const e = await env();
  e.iyz.nextFraudStatus = 0;
  const a = await e.svc.startTopup(
    e.userId,
    randomUUID(),
    { productCode: 'kredi.300', withdrawalWaiver: true, ...pack },
    buyer,
  );
  const tok = (await e.store.getOrder(a.orderId))?.checkoutToken as string;
  await e.svc.completeCheckout(tok);
  e.set(addDays(e.now, 9));
  await e.svc.recheckPendingOrders();
  expect((await e.store.getOrder(a.orderId))?.status).toBe('inceleniyor');
  e.iyz.decideFraud(tok, 2);
  const pid = e.iyz.checkouts.get(tok)?.paymentId;
  await e.svc.handleFraudNotification(JSON.stringify({ paymentId: Number(pid), fraudStatus: 2 }));
  expect((await e.store.getOrder(a.orderId))?.status).toBe('odendi');
  expect((await e.svc.wallet(e.userId)).balance).toBe(300);
  await e.pg.close();
}, 60_000);

it('D-N6 on Postgres: the hold of an unknown refund survives 31 days and the late decision closes it', async () => {
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
  e.set(addDays(e.now, 31));
  expect((await e.svc.wallet(e.userId)).balance).toBe(0);
  await e.svc.resolvePendingRefund(`paket:${a.orderId}`, 'basarili', 'admin-1');
  expect((await e.store.getOrder(a.orderId))?.status).toBe('iade_edildi');
  expect((await e.svc.wallet(e.userId)).balance).toBe(0);
  await e.pg.close();
}, 60_000);

it('O9 on Postgres: a deleted account with a live subscription is canceled by the daily job', async () => {
  const e = await env();
  const s = await e.svc.startSubscription(
    e.userId,
    randomUUID(),
    { planCode: 'ogrenci.aylik', ...plan },
    buyer,
  );
  const sub = await e.svc.completeSubscriptionCheckout(
    (await e.store.getOrder(s.orderId))?.checkoutToken as string,
  );
  await e.pg.query('update users set deleted_at = now() where id = $1', [e.userId]);
  expect(await e.svc.reconcileDeletedAccounts()).toBe(1);
  expect((await e.store.getSubscription(sub.id))?.status).toBe('iptal');
  expect(await e.svc.reconcileDeletedAccounts()).toBe(0);
  await e.pg.close();
}, 60_000);

it('O9 recovery: deleted package-only account gets exactly one refund request', async () => {
  const e = await env();
  const a = await e.svc.startTopup(
    e.userId,
    randomUUID(),
    { productCode: 'kredi.300', withdrawalWaiver: true, ...pack },
    buyer,
  );
  await e.svc.completeCheckout((await e.store.getOrder(a.orderId))?.checkoutToken as string);
  await e.pg.query('update users set deleted_at = now() where id = $1', [e.userId]);
  expect(await e.svc.reconcileDeletedAccounts()).toBe(1);
  await Promise.all([e.svc.onAccountDeletion(e.userId), e.svc.onAccountDeletion(e.userId)]);
  expect(
    (await e.store.listRefundRequests(e.userId)).filter((r) => r.reason?.startsWith('hesap_silme:')),
  ).toHaveLength(1);
  expect(await e.svc.reconcileDeletedAccounts()).toBe(0);
  await e.pg.close();
}, 60_000);

it('D3 Postgres claims serialize across store instances and preserve the response after restart', async () => {
  const e = await env();
  const second = new PgBillingStore(e.db, (id) => `hash-${id}`);
  const claims = await Promise.all([
    e.store.claimOperation(e.userId, 'refund.request', 'key-test', 'body1'),
    second.claimOperation(e.userId, 'refund.request', 'key-test', 'body1'),
  ]);
  expect(claims.filter((c) => c.state === 'claimed')).toHaveLength(1);
  expect(claims.filter((c) => c.state === 'pending')).toHaveLength(1);
  expect(await second.claimOperation(e.userId, 'refund.request', 'key-test', 'body2')).toEqual({
    state: 'conflict',
  });
  await e.store.finishOperation(e.userId, 'refund.request', 'key-test', {
    id: 'request1',
    status: 'bekliyor',
    amountKurus: 3900,
  });
  const restarted = new PgBillingStore(e.db, (id) => `hash-${id}`);
  expect(await restarted.claimOperation(e.userId, 'refund.request', 'key-test', 'body1')).toEqual({
    state: 'done',
    result: { id: 'request1', status: 'bekliyor', amountKurus: 3900 },
  });
  await e.pg.close();
}, 60000);

it('D3 recovery: an ownerless pending row resumes but keeps its request body binding', async () => {
  const e = await env();
  await e.pg.query(
    "insert into idempotency_keys(user_id,operation,key,request_hash,expires_at) values($1,'refund.request','crashed','body1',now()+interval '7 days')",
    [e.userId],
  );
  expect(await e.store.claimOperation(e.userId, 'refund.request', 'crashed', 'body2')).toEqual({
    state: 'conflict',
  });
  expect(await e.store.claimOperation(e.userId, 'refund.request', 'crashed', 'body1')).toEqual({
    state: 'claimed',
  });
  await e.store.releaseOperation(e.userId, 'refund.request', 'crashed');
  expect(await e.store.claimOperation(e.userId, 'refund.request', 'crashed', 'body2')).toEqual({
    state: 'conflict',
  });
  expect(await e.store.claimOperation(e.userId, 'refund.request', 'crashed', 'body1')).toEqual({
    state: 'claimed',
  });
  await e.store.finishOperation(e.userId, 'refund.request', 'crashed', { status: 'done' });
  await e.pg.close();
}, 60000);

it('D3 pool lock uses dedicated sessions, leaves business capacity and unlocks on completion', async () => {
  const e = await env();
  let held = 0;
  let released = 0;
  const pool = {
    query: e.db.query.bind(e.db),
    options: { max: 2 },
    connect: async () => ({
      query: async <R>(sql: string) => ({
        rows: [{ locked: sql.includes('try_advisory') ? ++held > 0 : --held === 0 }] as R[],
      }),
      release: () => {
        released++;
      },
    }),
  };
  const store = new PgBillingStore(pool, (id) => id);
  expect(await store.claimOperation(e.userId, 'test', 'first', 'a')).toEqual({ state: 'claimed' });
  expect(held).toBe(1);
  expect(await store.claimOperation(e.userId, 'test', 'second', 'b')).toEqual({ state: 'pending' });
  await store.finishOperation(e.userId, 'test', 'first', { ok: true });
  expect(held).toBe(0);
  expect(released).toBe(1);
  expect(await store.claimOperation(e.userId, 'test', 'second', 'b')).toEqual({ state: 'claimed' });
  await store.releaseOperation(e.userId, 'test', 'second');
  expect(held).toBe(0);
  expect(released).toBe(2);
  await e.pg.close();
}, 60000);

it('D4: repeated catalog version cannot rewrite historical product values', async () => {
  const e = await env();
  const changed = structuredClone(PRICE_TABLE_V1);
  const firstProduct = changed.products[0];
  if (!firstProduct) throw new Error('missing fixture product');
  firstProduct.priceKurus++;
  await expect(e.store.ensureCatalog(changed)).rejects.toThrow('price_version_content_mismatch');
  const { rows } = await e.pg.query<{ price_kurus: number }>(
    'select price_kurus from products where code=$1',
    [PRICE_TABLE_V1.products[0]?.code],
  );
  expect(rows[0]?.price_kurus).toBe(PRICE_TABLE_V1.products[0]?.priceKurus);
  await e.pg.close();
}, 60000);
it('D4: same-code versions keep old order/subscription product UUIDs and scope plan references', async () => {
  const e = await env();
  const a = await e.svc.startTopup(
    e.userId,
    randomUUID(),
    { productCode: 'kredi.300', withdrawalWaiver: true, ...pack },
    buyer,
  );
  const oldOrder = await e.store.getOrder(a.orderId);
  if (!oldOrder) throw new Error('missing fixture order');
  const subOrder = await e.svc.startSubscription(
    e.userId,
    randomUUID(),
    { planCode: 'ogrenci.aylik', ...plan },
    buyer,
  );
  const sub = await e.svc.completeSubscriptionCheckout(
    (await e.store.getOrder(subOrder.orderId))?.checkoutToken as string,
  );
  const originalSub = await e.store.getSubscription(sub.id);
  if (!originalSub) throw new Error('missing fixture subscription');
  // Emulate the architect-owned 0005 contraction on this disposable database only.
  await e.pg.query('alter table products drop constraint if exists products_code_unique');
  const next = structuredClone(PRICE_TABLE_V1);
  next.version = 'test-v2';
  next.effectiveFrom = new Date('2026-10-21T00:00:00Z');
  for (const product of next.products) product.priceKurus += 100;
  await e.store.ensureCatalog(next);
  const newOrderId = randomUUID();
  await e.store.saveOrder({
    ...oldOrder,
    productId: undefined,
    id: newOrderId,
    idempotencyKey: randomUUID(),
    createdAt: new Date('2026-10-22T00:00:00Z'),
    checkoutToken: null,
  });
  expect((await e.store.getOrder(newOrderId))?.productId).not.toBe(oldOrder?.productId);
  await e.store.saveSubscription({ ...originalSub, currentPeriodStart: new Date('2026-11-22T00:00:00Z') });
  expect((await e.store.getSubscription(sub.id))?.productId).toBe(originalSub?.productId);
  await e.store.saveOrder(oldOrder);
  expect((await e.store.getOrder(a.orderId))?.productId).toBe(oldOrder?.productId);
  const counts = await e.pg.query<{ count: number }>(
    'select count(*)::int as count from products where code=$1',
    ['kredi.300'],
  );
  expect(counts.rows[0]?.count).toBe(2);
  await e.store.savePlanRef('ogrenci.aylik', 'new-ref', next.version);
  expect((await e.store.planRefs(next.version)).get('ogrenci.aylik')).toBe('new-ref');
  expect((await e.store.planRefs(PRICE_TABLE_V1.version)).get('ogrenci.aylik')).not.toBe('new-ref');
  await e.pg.close();
}, 60000);
