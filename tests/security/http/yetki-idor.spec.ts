import { expect, test } from '@playwright/test';
import pg from 'pg';
import { base, bearer, kayit, oturumCerezi, type Kullanici } from './yardim.ts';

/**
 * Authorization and IDOR sampling over HTTP against the real server (plan 5.6/3, 15.3/7).
 * Complements apps/web/src/server/auth/__tests__/idor-rate.test.ts, which calls the handlers directly:
 * this spec goes through Next.js routing, the real session store and Postgres.
 */
const SIGNED_IN: [method: string, path: string, body?: unknown][] = [
  ['GET', '/api/v1/me'],
  ['PATCH', '/api/v1/me', {}],
  ['DELETE', '/api/v1/me'],
  ['GET', '/api/v1/me/export'],
  ['GET', '/api/v1/me/consents'],
  ['POST', '/api/v1/me/consents', { kind: 'aydinlatma', version: 'v1', granted: true }],
  ['PUT', '/api/v1/me/target-profession', { professionId: 'avukat' }],
  ['POST', '/api/v1/me/edu-verification', { email: 'x@ornek.edu.tr' }],
  ['POST', '/api/v1/kvkk-requests', { kind: 'bilgi', detail: 'x' }],
  ['GET', '/api/v1/wallet'],
  ['GET', '/api/v1/wallet/ledger'],
  ['GET', '/api/v1/invoices'],
  ['POST', '/api/v1/checkout/topup', { productId: 'x' }],
  ['POST', '/api/v1/checkout/subscription', { productId: 'x' }],
  ['POST', '/api/v1/subscriptions/00000000-0000-4000-8000-000000000000/cancel', { mode: 'donem_sonu' }],
  ['POST', '/api/v1/refund-requests', { orderId: '00000000-0000-4000-8000-000000000000' }],
];

const ADMIN = [
  '/api/v1/admin/flags',
  '/api/v1/admin/users?q=abc',
  '/api/v1/admin/prices',
  '/api/v1/admin/weights',
  '/api/v1/admin/reports',
  '/api/v1/admin/professions',
  '/api/v1/admin/queues/takedowns',
];

test.describe('misafir (signed out)', () => {
  for (const [method, path, body] of SIGNED_IN) {
    test(`${method} ${path} -> 401`, async ({ request }) => {
      const res = await request.fetch(path, { method, ...(body ? { data: body } : {}) });
      expect(res.status()).toBe(401);
    });
  }
  for (const path of ADMIN) {
    test(`GET ${path} -> 401`, async ({ request }) => {
      expect((await request.get(path)).status()).toBe(401);
    });
  }
  test('POST /api/v1/admin/ledger-adjustments -> 401', async ({ request }) => {
    expect((await request.post('/api/v1/admin/ledger-adjustments', { data: {} })).status()).toBe(401);
  });
  test('a forged bearer token is misafir', async ({ request }) => {
    const res = await request.get('/api/v1/me', { headers: { authorization: 'Bearer kalite.sahte.token' } });
    expect(res.status()).toBe(401);
  });
});

test.describe('kullanici (signed in)', () => {
  let a: Kullanici;
  let b: Kullanici;
  test.beforeAll(async ({ request, baseURL }) => {
    a = await kayit(request, baseURL);
    b = await kayit(request, baseURL);
  });

  test('GET /api/v1/me answers 200 with the caller only', async ({ request }) => {
    const res = await request.get('/api/v1/me', { headers: bearer(b) });
    expect(res.status(), (await res.text()).slice(0, 200)).toBe(200);
    expect((await res.json()).id).toBe(b.id);
  });

  test('a userId in the query or body never switches the subject', async ({ request }) => {
    const q = await request.get(`/api/v1/me?userId=${a.id}`, { headers: bearer(b) });
    expect(q.status()).toBe(200);
    expect((await q.json()).id).toBe(b.id);
    const patch = await request.patch('/api/v1/me', {
      headers: bearer(b),
      data: { userId: a.id, name: 'X' },
    });
    expect(patch.status(), 'unknown fields are rejected (zod strict)').toBe(400);
    const exp = await request.get('/api/v1/me/export', { headers: bearer(b) });
    expect(exp.status()).toBe(200);
    const text = await exp.text();
    expect(text).not.toContain(a.id);
    expect(text).not.toContain(a.email);
  });

  test('every admin route is 403 for kullanici', async ({ request }) => {
    for (const path of ADMIN)
      expect((await request.get(path, { headers: bearer(a) })).status(), path).toBe(403);
    const adj = await request.post('/api/v1/admin/ledger-adjustments', { headers: bearer(a), data: {} });
    expect(adj.status(), 'ledger-adjustments').toBe(403);
  });

  test('cookie writes from a foreign Origin or without Origin are refused (CSRF)', async ({
    request,
    baseURL,
  }) => {
    const cookie = await oturumCerezi(request, baseURL, a);
    const evil = await request.patch('/api/v1/me', {
      headers: { origin: 'https://evil.example', cookie },
      data: { name: 'X' },
    });
    expect(evil.status(), 'foreign Origin').toBe(403);
    const none = await request.patch('/api/v1/me', { headers: { cookie }, data: { name: 'X' } });
    expect(none.status(), 'no Origin').toBe(403);
    const ours = await request.patch('/api/v1/me', {
      headers: { origin: base(baseURL), cookie },
      data: { name: 'Guvenlik Deneme' },
    });
    expect(ours.status(), 'own Origin').toBe(200);
    const forged = await request.post('/api/auth/sign-in/email', {
      headers: { origin: 'https://evil.example', 'x-real-ip': '198.51.100.252' },
      data: { email: a.email, password: a.password },
    });
    expect(forged.status(), 'Better Auth refuses an untrusted origin').toBe(403);
  });

  test('B cannot cancel A subscription or refund A order (seeded rows)', async ({ request }) => {
    const url = process.env.KAZUIST_SEC_DATABASE_URL;
    test.skip(!url, 'KAZUIST_SEC_DATABASE_URL not set: rows of another user cannot be seeded');
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    try {
      const ids = async (code: string) =>
        (await db.query<{ id: string }>('SELECT id FROM products WHERE code = $1', [code])).rows[0]?.id;
      const planId = await ids('ogrenci.aylik');
      const packId = await ids('kredi.300');
      test.skip(!planId || !packId, 'no product rows (billing catalog not initialised)');
      const sub = await db.query<{ id: string }>(
        `INSERT INTO subscriptions (user_id, product_id, channel, provider_ref, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'iyzico', $3, 'aktif', now(), now() + interval '30 days') RETURNING id`,
        [a.id, planId, `kalite-${Date.now()}`],
      );
      const order = await db.query<{ id: string }>(
        `INSERT INTO orders (user_id, product_id, amount_kurus, status, idempotency_key, consent_versions, paid_at)
         VALUES ($1, $2, 100, 'odendi', $3, '{}'::jsonb, now()) RETURNING id`,
        [a.id, packId, `kalite-${Date.now()}`],
      );
      const subId = sub.rows[0]?.id ?? '';
      const orderId = order.rows[0]?.id ?? '';
      const cancel = await request.post(`/api/v1/subscriptions/${subId}/cancel`, {
        headers: bearer(b),
        data: { mode: 'hemen' },
      });
      expect(cancel.status(), 'cross-user cancel').toBe(404);
      const refund = await request.post('/api/v1/refund-requests', { headers: bearer(b), data: { orderId } });
      expect(refund.status(), 'cross-user refund').toBe(404);
      const after = await db.query<{ status: string; cancel_at_period_end: boolean }>(
        'SELECT status, cancel_at_period_end FROM subscriptions WHERE id = $1',
        [subId],
      );
      expect(after.rows[0]).toEqual({ status: 'aktif', cancel_at_period_end: false });
      const inv = await request.get('/api/v1/invoices', { headers: bearer(b) });
      expect(inv.status()).toBe(200);
      expect(await inv.text()).not.toContain(orderId);
    } finally {
      await db.end();
    }
  });
});

test.describe('rate limits (plan 5.6/3)', () => {
  test('sign in is limited to 30 per IP per minute', async ({ request, baseURL }) => {
    const ip = '198.51.100.253';
    let last = 0;
    for (let i = 0; i < 31; i++) {
      const r = await request.post('/api/auth/sign-in/email', {
        headers: { origin: base(baseURL), 'x-real-ip': ip },
        data: { email: 'yok@example.invalid', password: 'yanlis-parola-00' },
      });
      last = r.status();
    }
    expect(last).toBe(429);
  });
});
