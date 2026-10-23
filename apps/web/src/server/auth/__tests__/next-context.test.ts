import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as meRoute from '../../../app/api/v1/me/route.ts';
import * as exportRoute from '../../../app/api/v1/me/export/route.ts';
import * as kvkkRoute from '../../../app/api/v1/kvkk-requests/route.ts';
import * as professionsRoute from '../../../app/api/v1/professions/route.ts';
import * as queueRoute from '../../../app/api/v1/admin/queues/[queue]/route.ts';
import { withAuth } from '../guard.ts';
import { api, createHarness, signUp, type Harness } from './harness.ts';

/**
 * K-01: Next.js 16 calls a static route handler with `{ params: undefined }` and a dynamic one with
 * `{ params: Promise }`. These tests call the exported route modules exactly that way.
 */
let h: Harness;
let token: string;
const nextStatic = { params: undefined };

beforeAll(async () => {
  h = await createHarness();
  token = (await signUp('next@example.invalid')).token;
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

describe('route modules under the Next.js 16 calling convention', () => {
  it('static withAuth routes answer 200 and 401, never 500', async () => {
    expect((await meRoute.GET(api('/v1/me', token), nextStatic)).status).toBe(200);
    expect((await meRoute.GET(api('/v1/me', null), nextStatic)).status).toBe(401);
    expect((await exportRoute.GET(api('/v1/me/export', token), nextStatic)).status).toBe(200);
    const k = await kvkkRoute.POST(
      api('/v1/kvkk-requests', token, {
        method: 'POST',
        body: JSON.stringify({ kind: 'bilgi', detail: 'x' }),
      }),
      nextStatic,
    );
    expect(k.status).toBe(201);
  });

  it('static withPublic routes answer 200', async () => {
    expect((await professionsRoute.GET(api('/v1/professions', null), nextStatic)).status).toBe(200);
  });

  it('dynamic routes receive their params from the promise', async () => {
    // kullanici: the guard reaches the role check (403) without failing on params.
    const r = await queueRoute.GET(api('/v1/admin/queues/takedowns', token), {
      params: Promise.resolve({ queue: 'takedowns' }),
    });
    expect(r.status).toBe(403);
    let seen: Record<string, string> = {};
    const probe = withAuth({}, async (_req, _p, _ctx, params) => {
      seen = params;
      return new Response(null, { status: 204 });
    });
    expect(
      (await probe(api('/x', token), { params: Promise.resolve({ a: 'b', rest: ['c', 'd'] }) })).status,
    ).toBe(204);
    expect(seen).toEqual({ a: 'b', rest: 'c/d' });
    expect((await probe(api('/x', token), nextStatic)).status).toBe(204);
    expect(seen).toEqual({});
  });

  it('an internal error is logged with class, path and requestId only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = withAuth({}, async () => {
      throw new TypeError('secret detail ayse@example.invalid');
    });
    const res = await boom(api('/v1/boom?q=gizli', token), nextStatic);
    expect(res.status).toBe(500);
    const { requestId } = JSON.parse(await res.text());
    const line = String(log.mock.calls.at(-1)?.[0]);
    expect(JSON.parse(line)).toEqual({
      at: 'api',
      level: 'error',
      method: 'GET',
      path: '/api/v1/boom',
      error: 'TypeError',
      requestId,
    });
    expect(line).not.toMatch(/secret|ayse|gizli/);
    log.mockRestore();
  });

  it('sign up and deletion call the odeme account hooks', async () => {
    const { token: t } = await signUp('kanca@example.invalid');
    const id = JSON.parse(await (await meRoute.GET(api('/v1/me', t), nextStatic)).text()).id;
    expect(h.hookCalls).toContain(`signup:${id}`);
    expect((await meRoute.DELETE(api('/v1/me', t, { method: 'DELETE' }), nextStatic)).status).toBe(202);
    expect(h.hookCalls).toContain(`deletion:${id}`);
  });
});
