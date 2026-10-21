import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withAuth } from '../guard.ts';
import {
  adminFlagsGet,
  adminPricesGet,
  adminQueueGet,
  adminUsersGet,
  authHandler,
  consentsGet,
  consentsPost,
  eduConfirm,
  eduStart,
  kvkkPost,
  meDelete,
  meExport,
  meGet,
  mePatch,
  stepUpConfirm,
  targetProfessionPut,
} from '../handlers.ts';
import { json } from '../http.ts';
import { clientIp, MemoryRateLimitStore, RateLimiter } from '../rate-limit.ts';
import { api, authReq, BASE, createHarness, params, signUp, type Harness } from './harness.ts';

let h: Harness;
let a: { token: string; id: string };
let b: { token: string; id: string };
const body = async (r: Response) => JSON.parse(await r.text());

beforeAll(async () => {
  h = await createHarness();
  const ta = (await signUp('a@example.invalid')).token;
  const tb = (await signUp('b@example.invalid')).token;
  a = { token: ta, id: (await body(await meGet(api('/v1/me', ta)))).id };
  b = { token: tb, id: (await body(await meGet(api('/v1/me', tb)))).id };
  await consentsPost(
    api('/v1/me/consents', ta, {
      method: 'POST',
      body: JSON.stringify({ kind: 'aydinlatma', version: 'v1', granted: true }),
    }),
  );
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

const post = (_path: string, data: unknown) => ({ method: 'POST', body: JSON.stringify(data) });

describe('IDOR: one user never reaches another user resource', () => {
  const routes = [
    () => meGet(api('/v1/me', null)),
    () => mePatch(api('/v1/me', null, { method: 'PATCH', body: '{}' })),
    () => meDelete(api('/v1/me', null, { method: 'DELETE' })),
    () => meExport(api('/v1/me/export', null)),
    () => consentsGet(api('/v1/me/consents', null)),
    () =>
      consentsPost(
        api('/v1/me/consents', null, post('', { kind: 'aydinlatma', version: 'v1', granted: true })),
      ),
    () =>
      targetProfessionPut(
        api('/v1/me/target-profession', null, { method: 'PUT', body: '{"professionId":"avukat"}' }),
      ),
    () => eduStart(api('/v1/me/edu-verification', null, post('', { email: 'x@ornek.edu.tr' }))),
    () => eduConfirm(api('/v1/me/edu-verification/confirm', null, post('', { code: '123456' }))),
    () => kvkkPost(api('/v1/kvkk-requests', null, post('', { kind: 'bilgi', detail: 'x' }))),
  ];
  it.each(routes.map((r, i) => [i, r] as const))('route %i returns 401 for misafir', async (_i, r) => {
    expect((await r()).status).toBe(401);
  });

  it('B sees only B in /me, consents and export', async () => {
    expect((await body(await meGet(api('/v1/me', b.token)))).id).toBe(b.id);
    expect(await body(await consentsGet(api('/v1/me/consents', b.token)))).toEqual([]);
    const exp = JSON.stringify(await body(await meExport(api('/v1/me/export', b.token))));
    expect(exp).not.toContain('a@example.invalid');
    expect(exp).not.toContain(a.id);
  });

  it('a userId smuggled in a body or query is rejected or ignored', async () => {
    const r = await mePatch(
      api('/v1/me', b.token, { method: 'PATCH', body: JSON.stringify({ userId: a.id, name: 'X' }) }),
    );
    expect(r.status).toBe(400);
    const c = await consentsPost(
      api(
        '/v1/me/consents',
        b.token,
        post('', { kind: 'aydinlatma', version: 'v1', granted: false, userId: a.id }),
      ),
    );
    expect(c.status).toBe(400);
    const q = await body(await meGet(api(`/v1/me?userId=${a.id}`, b.token)));
    expect(q.id).toBe(b.id);
    const aConsents = await body(await consentsGet(api('/v1/me/consents', a.token)));
    expect(aConsents).toHaveLength(1);
  });

  it('B deleting the account does not touch A', async () => {
    const { token } = await signUp('c@example.invalid');
    expect((await meDelete(api('/v1/me', token, { method: 'DELETE' }))).status).toBe(202);
    expect((await meGet(api('/v1/me', a.token))).status).toBe(200);
  });

  it('cookie authenticated writes without our Origin get 403', async () => {
    const res = await authHandler(
      authReq('/sign-in/email', { email: 'b@example.invalid', password: 'parola-cok-gizli-1' }),
    );
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const evil = await mePatch(
      new Request(`${BASE}/api/v1/me`, {
        method: 'PATCH',
        headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' },
        body: '{"name":"x"}',
      }),
    );
    expect(evil.status).toBe(403);
    const none = await mePatch(
      new Request(`${BASE}/api/v1/me`, { method: 'PATCH', headers: { cookie }, body: '{"name":"x"}' }),
    );
    expect(none.status).toBe(403);
    const ours = await mePatch(
      new Request(`${BASE}/api/v1/me`, {
        method: 'PATCH',
        headers: { cookie, origin: BASE },
        body: '{"name":"Bb"}',
      }),
    );
    expect(ours.status).toBe(200);
  });
});

describe('roles: admin endpoints are closed to kullanici and misafir', () => {
  const editorOnly = withAuth({ roles: ['editor', 'yonetici'] }, async () => json({ ok: true }));
  const adminRoutes = [
    (t: string | null) => adminQueueGet(api('/v1/admin/queues/takedowns', t), params({ queue: 'takedowns' })),
    (t: string | null) => adminFlagsGet(api('/v1/admin/flags', t)),
    (t: string | null) => adminUsersGet(api('/v1/admin/users?q=abc', t)),
    (t: string | null) => adminPricesGet(api('/v1/admin/prices', t)),
  ];

  it('misafir gets 401 and kullanici 403 on every admin route', async () => {
    for (const r of adminRoutes) {
      expect((await r(null)).status).toBe(401);
      expect((await r(a.token)).status).toBe(403);
    }
    expect((await editorOnly(api('/x', a.token))).status).toBe(403);
    expect(
      (await stepUpConfirm(api('/auth/step-up/confirm', a.token, post('', { code: '123456' })))).status,
    ).toBe(403);
  });
});

describe('rate limits', () => {
  it('memory store counts per window and resets', async () => {
    let t = 0;
    const l = new RateLimiter(new MemoryRateLimitStore(() => t));
    const rule = { name: 't', limit: 2, windowSec: 10 };
    expect((await l.check(rule, 'k')).ok).toBe(true);
    expect((await l.check(rule, 'k')).ok).toBe(true);
    const third = await l.check(rule, 'k');
    expect(third).toEqual({ ok: false, retryAfterSec: 10 });
    expect((await l.check(rule, 'other')).ok).toBe(true);
    t = 10_001;
    expect((await l.check(rule, 'k')).ok).toBe(true);
  });

  it('reads the client IP behind a fixed number of trusted proxies', () => {
    const hd = new Headers({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' });
    expect(clientIp(hd, 1)).toBe('1.2.3.4');
    expect(clientIp(hd, 2)).toBe('6.6.6.6');
    expect(clientIp(new Headers({ 'x-real-ip': '9.9.9.9' }), 0)).toBe('9.9.9.9');
  });

  it('auth handler returns 429 with Retry-After after 30 requests per IP', async () => {
    const ip = '203.0.113.7';
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) {
      last = await authHandler(
        authReq('/sign-in/email', { email: 'yok@example.invalid', password: 'yanlis-parola-00' }, ip),
      );
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await body(last as Response)).code).toBe('rate_limited');
  });

  it('e-mail code requests are limited to 5 per IP in 10 minutes', async () => {
    const ip = '203.0.113.8';
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await authHandler(
        authReq('/email-otp/send-verification-otp', { email: `x${i}@example.invalid`, type: 'sign-in' }, ip),
      );
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('edu code requests are limited per user', async () => {
    const { token } = await signUp('limit@example.invalid');
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (await eduStart(api('/v1/me/edu-verification', token, post('', { email: 'l@ogr.ornek.edu.tr' }))))
          .status,
      );
    }
    expect(statuses).toEqual([204, 204, 204, 429]);
  });
});
