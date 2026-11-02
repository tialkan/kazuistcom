import { HistoricalBillingService as BillingService } from '../../../../../../packages/ledger/test/billing/historical-subscription.ts';
import { adminRefundRequestsGet, adminRefundRequestGet, adminRefundRequestMutation } from '../handlers.ts';
import { createOTP } from '@better-auth/utils/otp';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { FakeIyzico, FakeEArsiv, FAKE_CFG, PgBillingStore, PgLedgerPort } from '@kazuist/ledger/billing';
import { PRICE_TABLE_V1 } from '@kazuist/ledger';
import type { SqlClient } from '@kazuist/ledger/pg';
import { schema } from '../../auth/db.ts';
import { meGet, stepUpConfirm } from '../../auth/handlers.ts';
import { api, BASE, createHarness, signUp, type Harness } from '../../auth/__tests__/harness.ts';
import { setBillingService } from '../context.ts';
import { POST as redeem } from '../../../app/api/v1/coupons/redeem/route.ts';
import { POST as chargeback } from '../../../app/api/v1/admin/chargebacks/route.ts';
import { POST as priceChange } from '../../../app/api/v1/admin/price-changes/route.ts';
let h: Harness;
let svc: BillingService;
let store: PgBillingStore;
let iyz: FakeIyzico;
const body = async (r: Response) => JSON.parse(await r.text());
const post = (data: unknown) => ({
  method: 'POST',
  body: JSON.stringify(data),
  headers: { 'Idempotency-Key': 'admin-billing-test-key' },
});

function base32Decode(s: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes).toString('utf8');
}

/** A yonetici with a passkey session (auth_method set as the passkey hook would) and TOTP enrolled. */
async function admin(email: string): Promise<{ token: string; secret: string; id: string }> {
  let { token } = await signUp(email);
  const id = (await body(await meGet(api('/v1/me', token)))).id as string;
  await h.db.insert(schema.userRoles).values({ userId: id, roleId: 'yonetici' });
  await h.db.update(schema.sessions).set({ authMethod: 'passkey' }).where(eq(schema.sessions.userId, id));
  const auth = () => new Headers({ authorization: `Bearer ${token}` });
  const en = (await h.ctx.auth.api.enableTwoFactor({
    body: { password: 'parola-cok-gizli-1' },
    headers: auth(),
  })) as { totpURI: string };
  const secret = base32Decode(new URL(en.totpURI).searchParams.get('secret') ?? '');
  const code = await createOTP(secret).totp();
  const res = await h.ctx.auth.api.verifyTOTP({ body: { code }, headers: auth(), returnHeaders: true });
  token = res.headers.get('set-auth-token') ?? token;
  return { token, secret, id };
}

beforeAll(async () => {
  h = await createHarness();
  const db = h.pg as unknown as SqlClient;
  store = new PgBillingStore(db, (id) => `hash-${id}`);
  await store.ensureCatalog(PRICE_TABLE_V1);
  iyz = new FakeIyzico();
  svc = new BillingService({
    iyzico: iyz,
    iyzicoCfg: FAKE_CFG,
    earsiv: new FakeEArsiv(),
    store,
    ledger: new PgLedgerPort(db),
    now: () => new Date(),
    newId: randomUUID,
    callbackBaseUrl: BASE,
    webAddress: BASE,
  });
  setBillingService(svc);
}, 60000);
afterAll(async () => {
  setBillingService(undefined);
  await h.pg.close();
});
it('D8: coupon redemption reaches the real ledger and rejects unknown fields', async () => {
  const user = await signUp('coupon-route@example.invalid');
  await h.pg.query("insert into coupons (code,credits,max_redemptions) values ('ROUTE',25,10)");
  expect((await redeem(api('/v1/coupons/redeem', null, post({ code: 'ROUTE' })))).status).toBe(401);
  expect(
    (await redeem(api('/v1/coupons/redeem', user.token, post({ code: 'ROUTE', extra: true })))).status,
  ).toBe(400);
  expect(await body(await redeem(api('/v1/coupons/redeem', user.token, post({ code: 'ROUTE' }))))).toEqual({
    credits: 25,
  });
  expect(await body(await redeem(api('/v1/coupons/redeem', user.token, post({ code: 'ROUTE' }))))).toEqual({
    credits: 25,
  });
});
it('D8: admin routes require role, passkey and TOTP and persist actor audit', async () => {
  const user = await signUp('billing-user@example.invalid');
  for (const route of [chargeback, priceChange]) {
    expect((await route(api('/v1/admin/test', null, post({})))).status).toBe(401);
    expect((await route(api('/v1/admin/test', user.token, post({})))).status).toBe(403);
  }
  const adm = await admin('billing-admin@example.invalid');
  expect(
    (
      await priceChange(
        api('/v1/admin/price-changes', adm.token, post({ planCode: 'ogrenci.aylik', newPriceKurus: 10000 })),
      )
    ).status,
  ).toBe(403);
  await stepUpConfirm(
    api('/auth/step-up/confirm', adm.token, post({ code: await createOTP(adm.secret).totp() })),
  );
  expect(
    (
      await priceChange(
        api(
          '/v1/admin/price-changes',
          adm.token,
          post({ planCode: 'ogrenci.aylik', newPriceKurus: 10000, extra: true }),
        ),
      )
    ).status,
  ).toBe(400);
  const buyer = {
    id: adm.id,
    email: 'a@example.invalid',
    name: 'A',
    surname: 'B',
    identityNumber: '11111111111',
    ip: '127.0.0.1',
    city: 'Ankara',
    country: 'Turkey',
    address: 'Test',
  };
  await svc.setupSubscriptionCatalog();
  const subOrder = await svc.startSubscription(
    adm.id,
    randomUUID(),
    {
      planCode: 'ogrenci.aylik',
      preInfoConsentVersion: 'onb',
      distanceContractConsentVersion: 'abo',
      withdrawalWaiver: true,
    },
    buyer,
  );
  const sub = await svc.completeSubscriptionCheckout(
    (await store.getOrder(subOrder.orderId))?.checkoutToken as string,
  );
  const pack = await svc.startTopup(
    adm.id,
    randomUUID(),
    {
      productCode: 'kredi.300',
      preInfoConsentVersion: 'onb',
      distanceContractConsentVersion: 'mss',
      withdrawalWaiver: true,
    },
    buyer,
  );
  await svc.completeCheckout((await store.getOrder(pack.orderId))?.checkoutToken as string);
  const before = (await svc.wallet(adm.id)).balance;
  const cb = await chargeback(
    api('/v1/admin/chargebacks', adm.token, post({ orderId: pack.orderId, caseRef: 'case-test' })),
  );
  expect(cb.status).toBe(200);
  expect(await body(cb)).toEqual({ balance: before - 300 });
  expect(
    await body(
      await chargeback(
        api('/v1/admin/chargebacks', adm.token, post({ orderId: pack.orderId, caseRef: 'case-test' })),
      ),
    ),
  ).toEqual({ balance: before - 300 });
  expect(
    (
      await chargeback(
        api('/v1/admin/chargebacks', adm.token, post({ orderId: pack.orderId, caseRef: 'different' })),
      )
    ).status,
  ).toBe(409);
  const result = await priceChange(
    api('/v1/admin/price-changes', adm.token, post({ planCode: 'ogrenci.aylik', newPriceKurus: 10000 })),
  );
  expect(result.status).toBe(200);
  expect(await body(result)).toEqual({ notified: 1 });
  const rows = await h.pg.query<{ actor_id: string }>(
    "select actor_id from audit_log where action='billing.price_change'",
  );
  expect(rows.rows[0]?.actor_id).toBe(adm.id);
  expect((await store.getSubscription(sub.id))?.pendingPrice?.priceKurus).toBe(10000);
  const chargeAudit = await h.pg.query<{ actor_id: string }>(
    "select actor_id from audit_log where action='billing.chargeback'",
  );
  expect(chargeAudit.rows[0]?.actor_id).toBe(adm.id);
  expect(
    (
      await priceChange(
        api('/v1/admin/price-changes', adm.token, post({ planCode: 'ogrenci.aylik', newPriceKurus: 10001 })),
      )
    ).status,
  ).toBe(409);
  const statuses = [];
  for (let i = 0; i < 12; i++)
    statuses.push(
      (
        await priceChange(
          api(
            '/v1/admin/price-changes',
            adm.token,
            post({ planCode: 'ogrenci.aylik', newPriceKurus: 10000 }),
          ),
        )
      ).status,
    );
  expect(statuses).toContain(429);
});

it('deletion request routes enforce admin MFA, strict bodies and execute the real transactional review', async () => {
  const owner = await signUp('deleted-review-owner@example.invalid');
  const ownerId = (await body(await meGet(api('/v1/me', owner.token)))).id as string;
  const route = { params: Promise.resolve({ requestId: randomUUID() }) };
  expect((await adminRefundRequestGet(api('/v1/admin/refund-requests/x', null), route)).status).toBe(401);
  expect((await adminRefundRequestsGet(api('/v1/admin/refund-requests', owner.token))).status).toBe(403);
  const adm = await admin('deleted-review-admin@example.invalid');
  expect((await adminRefundRequestsGet(api('/v1/admin/refund-requests', adm.token))).status).toBe(403);
  await stepUpConfirm(
    api('/auth/step-up/confirm', adm.token, post({ code: await createOTP(adm.secret).totp() })),
  );
  const buyer = {
    id: ownerId,
    email: 'test@example.invalid',
    name: 'A',
    surname: 'B',
    identityNumber: '11111111111',
    ip: '127.0.0.1',
    city: 'Ankara',
    country: 'Turkey',
    address: 'Test',
  };
  const pack = await svc.startTopup(
    ownerId,
    randomUUID(),
    {
      productCode: 'kredi.300',
      preInfoConsentVersion: 'onb',
      distanceContractConsentVersion: 'mss',
      withdrawalWaiver: true,
    },
    buyer,
  );
  await svc.completeCheckout((await store.getOrder(pack.orderId))?.checkoutToken as string);
  await h.pg.query('update users set deleted_at=now() where id=$1', [ownerId]);
  await svc.onAccountDeletion(ownerId);
  const requests = await store.listRefundRequests(ownerId);
  const request = requests[0];
  if (!request) throw new Error('missing request');
  const params = { params: Promise.resolve({ requestId: request.id }) };
  const list = await adminRefundRequestsGet(api('/v1/admin/refund-requests', adm.token));
  expect(list.status).toBe(200);
  expect(list.headers.get('cache-control')).toBe('private, no-store');
  const detail = await adminRefundRequestGet(api('/v1/admin/refund-requests/x', adm.token), params);
  expect(detail.status).toBe(200);
  expect((await body(detail)).candidates[0].maxRefundKurus).toBe(3900);
  const input = { decision: 'onay', reason: 'Kullanılmamış paket kredileri doğrulandı.' };
  expect(
    (
      await adminRefundRequestMutation(
        'decision',
        api('/v1/admin/refund-requests/x/decision', adm.token, post({ ...input, extra: true })),
        params,
      )
    ).status,
  ).toBe(400);
  const before = iyz.refunds.length;
  const decision = await adminRefundRequestMutation(
    'decision',
    api('/v1/admin/refund-requests/x/decision', adm.token, post(input)),
    params,
  );
  expect(decision.status).toBe(200);
  expect((await body(decision)).status).toBe('tamamlandi');
  expect(iyz.refunds.length).toBe(before + 1);
  expect((await svc.wallet(ownerId)).balance).toBe(0);
  const audit = await h.pg.query<{ actor_id: string }>(
    "select actor_id from audit_log where subject_id=$1 and action='billing.deletion_refund.decision'",
    [request.id],
  );
  expect(audit.rows[0]?.actor_id).toBe(adm.id);
});
it('unknown deletion item routes keep 202 until explicit manual resolution, without a second provider send', async () => {
  const owner = await signUp('deleted-review-unknown@example.invalid');
  const ownerId = (await body(await meGet(api('/v1/me', owner.token)))).id as string;
  const adm = await admin('deleted-review-unknown-admin@example.invalid');
  await stepUpConfirm(
    api('/auth/step-up/confirm', adm.token, post({ code: await createOTP(adm.secret).totp() })),
  );
  const buyer = {
    id: ownerId,
    email: 'test@example.invalid',
    name: 'A',
    surname: 'B',
    identityNumber: '11111111111',
    ip: '127.0.0.1',
    city: 'Ankara',
    country: 'Turkey',
    address: 'Test',
  };
  const pack = await svc.startTopup(
    ownerId,
    randomUUID(),
    {
      productCode: 'kredi.300',
      preInfoConsentVersion: 'onb',
      distanceContractConsentVersion: 'mss',
      withdrawalWaiver: true,
    },
    buyer,
  );
  await svc.completeCheckout((await store.getOrder(pack.orderId))?.checkoutToken as string);
  await h.pg.query('update users set deleted_at=now() where id=$1', [ownerId]);
  await svc.onAccountDeletion(ownerId);
  const request = (await store.listRefundRequests(ownerId))[0];
  if (!request) throw new Error('missing request');
  const params = { params: Promise.resolve({ requestId: request.id }) };
  iyz.nextRefund = 'unknown';
  const before = iyz.refunds.length;
  const approved = await adminRefundRequestMutation(
    'decision',
    api(
      '/v1/admin/refund-requests/x/decision',
      adm.token,
      post({ decision: 'onay', reason: 'Kalan paket kredileri için onay.' }),
    ),
    params,
  );
  expect(approved.status).toBe(202);
  const item = (await body(approved)).items[0];
  const executed = await adminRefundRequestMutation(
    'execute',
    api('/v1/admin/refund-requests/x/execute', adm.token, post({})),
    params,
  );
  expect(executed.status).toBe(202);
  expect(iyz.refunds.length).toBe(before + 1);
  const resolved = await adminRefundRequestMutation(
    'resolve',
    api(
      '/v1/admin/refund-requests/x/items/x/resolve',
      adm.token,
      post({
        outcome: 'basarili',
        reason: 'Sağlayıcı panelinde iade doğrulandı.',
        providerResultRef: 'panel-proof',
      }),
    ),
    { params: Promise.resolve({ requestId: request.id, itemId: item.id }) },
  );
  expect(resolved.status).toBe(200);
  expect((await body(resolved)).status).toBe('tamamlandi');
  expect(iyz.refunds.length).toBe(before + 1);
});
