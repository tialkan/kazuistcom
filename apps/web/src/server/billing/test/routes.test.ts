/** /api/v1 billing routes through kimlik's withAuth on PGlite, with PgBillingStore and the fake iyzico. */
import { randomUUID } from 'node:crypto';
import { PRICE_TABLE_V1 } from '@kazuist/ledger';
import {
  BillingService,
  FAKE_CFG,
  FakeEArsiv,
  FakeIyzico,
  PgBillingStore,
  PgLedgerPort,
} from '@kazuist/ledger/billing';
import type { SqlClient } from '@kazuist/ledger/pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as pricesGET } from '../../../app/api/v1/prices/route.ts';
import { POST as topupPOST } from '../../../app/api/v1/checkout/topup/route.ts';
import { POST as callbackPOST } from '../../../app/api/v1/checkout/callback/route.ts';
import { GET as walletGET } from '../../../app/api/v1/wallet/route.ts';
import { GET as ledgerGET } from '../../../app/api/v1/wallet/ledger/route.ts';
import { GET as invoicesGET } from '../../../app/api/v1/invoices/route.ts';
import { POST as webhookPOST } from '../../../app/api/v1/webhooks/iyzico/route.ts';
import { POST as cancelPOST } from '../../../app/api/v1/subscriptions/[id]/cancel/route.ts';
import { POST as refundPOST } from '../../../app/api/v1/refund-requests/route.ts';
import { BASE, api, createHarness, signUp, type Harness } from '../../auth/__tests__/harness.ts';
import { setBillingService } from '../context.ts';

let h: Harness;
let iyz: FakeIyzico;
let token: string;

beforeAll(async () => {
  h = await createHarness();
  const db = h.pg as unknown as SqlClient;
  const store = new PgBillingStore(db, (id) => `hash-${id}`);
  await store.ensureCatalog(PRICE_TABLE_V1);
  iyz = new FakeIyzico();
  setBillingService(
    new BillingService({
      iyzico: iyz,
      iyzicoCfg: FAKE_CFG,
      earsiv: new FakeEArsiv(),
      store,
      ledger: new PgLedgerPort(db),
      now: () => new Date(),
      newId: randomUUID,
      callbackBaseUrl: BASE,
      webAddress: BASE,
    }),
  );
  token = (await signUp('odeme@example.invalid')).token;
}, 60_000);

afterAll(async () => {
  setBillingService(undefined);
  await h.pg.close();
});

const topupBody = {
  productCode: 'kredi.300',
  preInfoConsentVersion: 'onb-1',
  distanceContractConsentVersion: 'mss-1',
  withdrawalWaiver: true,
};

describe('billing routes', () => {
  it('serves prices publicly with the approved values', async () => {
    const res = await pricesGET(
      new Request(`${BASE}/api/v1/prices`, { headers: { 'x-forwarded-for': '10.9.0.1' } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { products: { code: string; priceKurus: number }[] };
    expect(body.products.find((p) => p.code === 'kredi.1000')?.priceKurus).toBe(10900);
  });

  it('requires a session for the wallet', async () => {
    expect((await walletGET(api('/v1/wallet', null))).status).toBe(401);
    const res = await walletGET(api('/v1/wallet', token));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ balance: 0, lots: [] });
  });

  it('buys a package end to end: checkout, iyzico callback re-query, wallet, ledger, invoices, consents', async () => {
    const noKey = await topupPOST(
      api('/v1/checkout/topup', token, { method: 'POST', body: JSON.stringify(topupBody) }),
    );
    expect(noKey.status).toBe(400);
    const res = await topupPOST(
      api('/v1/checkout/topup', token, {
        method: 'POST',
        body: JSON.stringify(topupBody),
        headers: { 'Idempotency-Key': 'route-test-0001' },
      }),
    );
    expect(res.status).toBe(201);
    const [checkoutToken] = [...iyz.checkouts.keys()];
    const form = new FormData();
    form.set('token', checkoutToken as string);
    const cb = await callbackPOST(
      new Request(`${BASE}/api/v1/checkout/callback`, {
        method: 'POST',
        body: form,
        headers: { 'x-forwarded-for': '10.9.0.2' },
      }),
    );
    expect(cb.status).toBe(303);
    expect(cb.headers.get('location')).toBe(`${BASE}/odeme/donus?durum=basarili`);
    expect(await (await walletGET(api('/v1/wallet', token))).json()).toMatchObject({ balance: 300 });
    expect(
      ((await (await ledgerGET(api('/v1/wallet/ledger', token))).json()) as { kind: string }[]).map(
        (m) => m.kind,
      ),
    ).toEqual(['yukleme']);
    expect(((await (await invoicesGET(api('/v1/invoices', token))).json()) as unknown[]).length).toBe(1);
    const kinds = (
      await h.pg.query<{ kind: string }>('select kind::text kind from consents order by kind')
    ).rows.map((r) => r.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['cayma_istisnasi', 'mesafeli_sozlesme', 'on_bilgilendirme']),
    );
  });

  it('rejects an unsigned webhook', async () => {
    const res = await webhookPOST(
      new Request(`${BASE}/api/v1/webhooks/iyzico`, {
        method: 'POST',
        body: JSON.stringify({ iyziReferenceCode: 'x', iyziEventType: 'CHECKOUT_FORM_AUTH', token: 't' }),
        headers: { 'x-forwarded-for': '10.9.0.3', 'X-IYZ-SIGNATURE-V3': 'bad' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('another user cancelling or refunding gets 404 before body validation (IDOR, quality gate)', async () => {
    const other = (await signUp('baska@example.invalid')).token;
    const owner = (
      await h.pg.query<{ id: string }>("select id from users where email = 'odeme@example.invalid'")
    ).rows[0]?.id;
    const plan = (await h.pg.query<{ id: string }>("select id from products where code = 'ogrenci.aylik'"))
      .rows[0]?.id;
    const sub = (
      await h.pg.query<{ id: string }>(
        `insert into subscriptions (user_id, product_id, channel, provider_ref, status, current_period_start, current_period_end)
         values ($1, $2, 'iyzico', 'idor-1', 'aktif', now(), now() + interval '30 days') returning id`,
        [owner, plan],
      )
    ).rows[0]?.id;
    const order = (await h.pg.query<{ id: string }>('select id from orders limit 1')).rows[0]?.id;
    const c = await cancelPOST(
      api(`/v1/subscriptions/${sub}/cancel`, other, {
        method: 'POST',
        body: JSON.stringify({ mode: 'hemen' }),
      }),
      {
        params: Promise.resolve({ id: sub as string }),
      },
    );
    expect(c.status).toBe(404);
    const r = await refundPOST(
      api('/v1/refund-requests', other, { method: 'POST', body: JSON.stringify({ orderId: order }) }),
    );
    expect(r.status).toBe(404);
    expect((await h.pg.query('select status from subscriptions where id = $1', [sub])).rows).toEqual([
      { status: 'aktif' },
    ]);
  });
});
