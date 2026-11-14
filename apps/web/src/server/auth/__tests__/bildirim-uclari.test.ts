import { readFileSync } from 'node:fs';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mandatoryEmailTypes as workerMandatory } from '../../../../../worker-node/src/notify/types.ts';
import { marketingConsent } from '../account-view.ts';
import { schema } from '../db.ts';
import {
  apnsTokenPost,
  consentsPost,
  meGet,
  notificationPrefsGet,
  notificationPrefsPut,
  webPushPost,
} from '../handlers.ts';
import {
  mandatoryEmailTypes,
  PUSH_TARGETS_PER_CHANNEL,
  pushEndpointAllowed,
  webPushKeysValid,
} from '../notifications.ts';
import { rules } from '../rate-limit.ts';
import { api, createHarness, signUp, type Harness } from './harness.ts';

/** /v1/notifications/preferences, /v1/push/web-subscriptions, /v1/push/apns-tokens (contract v1.5 planlandi). */

let h: Harness;
let a: { token: string; id: string };
let b: { token: string; id: string };
const body = async (r: Response) => JSON.parse(await r.text());
const json = (method: string, data: unknown) => ({ method, body: JSON.stringify(data) });

const keys = {
  p256dh: Buffer.alloc(65, 4).toString('base64url'),
  auth: Buffer.alloc(16, 9).toString('base64url'),
};
const fcm = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;
const token = (n: number) => n.toString(16).padStart(64, '0');

const subs = async (userId: string) =>
  h.db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));

beforeAll(async () => {
  h = await createHarness();
  const ta = (await signUp('bildirim-a@example.invalid')).token;
  const tb = (await signUp('bildirim-b@example.invalid')).token;
  a = { token: ta, id: (await body(await meGet(api('/v1/me', ta)))).id };
  b = { token: tb, id: (await body(await meGet(api('/v1/me', tb)))).id };
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

describe('notification preferences', () => {
  it('starts empty (every type at its default) for a new account', async () => {
    const r = await notificationPrefsGet(api('/v1/notifications/preferences', a.token));
    expect(r.status).toBe(200);
    expect(await body(r)).toEqual({ email: {}, webPush: {}, apns: {} });
  });

  it('PUT replaces the channels it names and keeps the others; mandatory e-mail types stay on', async () => {
    let r = await notificationPrefsPut(
      api(
        '/v1/notifications/preferences',
        a.token,
        json('PUT', { email: { kalemcik: false, odeme: false }, apns: { teslim_hatirlatmasi: false } }),
      ),
    );
    expect(r.status).toBe(200);
    expect(await body(r)).toEqual({
      email: { kalemcik: false },
      webPush: {},
      apns: { teslim_hatirlatmasi: false },
    });
    r = await notificationPrefsPut(
      api('/v1/notifications/preferences', a.token, json('PUT', { email: { kampanya: true } })),
    );
    expect(await body(r)).toEqual({
      email: { kampanya: true },
      webPush: {},
      apns: { teslim_hatirlatmasi: false },
    });
    const [row] = await h.db
      .select()
      .from(schema.notificationPrefs)
      .where(eq(schema.notificationPrefs.userId, a.id));
    expect(row?.webPush).toEqual({});
    const [audit] = await h.db
      .select()
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.actorId, a.id), eq(schema.auditLog.action, 'notifications.preferences.set')),
      );
    expect(audit?.subjectType).toBe('notification_prefs');
  });

  it('rejects unknown types, channels and non boolean values', async () => {
    for (const bad of [
      { email: { bilinmeyen: true } },
      { sms: {} },
      { email: { kalemcik: 'hayir' } },
      { userId: b.id, email: {} },
    ]) {
      const r = await notificationPrefsPut(api('/v1/notifications/preferences', a.token, json('PUT', bad)));
      expect(r.status).toBe(400);
    }
  });

  it('IDOR: B never sees or changes A', async () => {
    expect(await body(await notificationPrefsGet(api('/v1/notifications/preferences', b.token)))).toEqual({
      email: {},
      webPush: {},
      apns: {},
    });
    await notificationPrefsPut(
      api('/v1/notifications/preferences', b.token, json('PUT', { email: { kalemcik: true } })),
    );
    const mine = await body(
      await notificationPrefsGet(api(`/v1/notifications/preferences?userId=${b.id}`, a.token)),
    );
    expect(mine.email).toEqual({ kampanya: true });
  });

  it('mandatory e-mail types match the worker', () => {
    expect([...mandatoryEmailTypes].sort()).toEqual([...workerMandatory].sort());
  });
});

describe('push targets', () => {
  it('accepts only https endpoints of the browser push services', () => {
    expect(pushEndpointAllowed(fcm('abc'))).toBe(true);
    expect(pushEndpointAllowed('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(pushEndpointAllowed('https://web.push.apple.com/QX')).toBe(true);
    expect(pushEndpointAllowed('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/x',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://evilnotify.windows.com/x',
      `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
    ])
      expect(pushEndpointAllowed(bad)).toBe(false);
    expect(webPushKeysValid(keys)).toBe(true);
    expect(webPushKeysValid({ p256dh: 'a', auth: keys.auth })).toBe(false);
    expect(webPushKeysValid({ p256dh: keys.p256dh, auth: 'a+b/' })).toBe(false);
  });

  it('registers a Web Push subscription: 201 {id}, an internal URL is 400', async () => {
    const r = await webPushPost(
      api('/v1/push/web-subscriptions', a.token, json('POST', { endpoint: fcm('a1'), keys })),
    );
    expect(r.status).toBe(201);
    const { id } = await body(r);
    const [row] = (await subs(a.id)).filter((s) => s.id === id);
    expect(row).toMatchObject({ channel: 'web_push', endpoint: fcm('a1'), keys, environment: null });
    const ssrf = await webPushPost(
      api('/v1/push/web-subscriptions', a.token, json('POST', { endpoint: 'https://10.0.0.1/x', keys })),
    );
    expect(ssrf.status).toBe(400);
    const extra = await webPushPost(
      api('/v1/push/web-subscriptions', a.token, json('POST', { endpoint: fcm('a2'), keys, userId: b.id })),
    );
    expect(extra.status).toBe(400);
  });

  it('registers an APNs token with its environment; a malformed token is 400', async () => {
    const r = await apnsTokenPost(
      api('/v1/push/apns-tokens', a.token, json('POST', { deviceToken: token(1), environment: 'sandbox' })),
    );
    expect(r.status).toBe(201);
    expect((await subs(a.id)).find((s) => s.channel === 'apns')).toMatchObject({
      endpoint: token(1),
      environment: 'sandbox',
      keys: null,
    });
    for (const bad of [
      { deviceToken: 'ABC'.repeat(30), environment: 'sandbox' },
      { deviceToken: token(2), environment: 'test' },
    ]) {
      expect((await apnsTokenPost(api('/v1/push/apns-tokens', a.token, json('POST', bad)))).status).toBe(400);
    }
  });

  it('the same device registered again by another account moves to that account', async () => {
    await webPushPost(
      api('/v1/push/web-subscriptions', a.token, json('POST', { endpoint: fcm('ortak'), keys })),
    );
    await webPushPost(
      api('/v1/push/web-subscriptions', a.token, json('POST', { endpoint: fcm('ortak'), keys })),
    );
    expect((await subs(a.id)).filter((s) => s.endpoint === fcm('ortak'))).toHaveLength(1);
    await webPushPost(
      api('/v1/push/web-subscriptions', b.token, json('POST', { endpoint: fcm('ortak'), keys })),
    );
    expect((await subs(a.id)).filter((s) => s.endpoint === fcm('ortak'))).toHaveLength(0);
    expect((await subs(b.id)).filter((s) => s.endpoint === fcm('ortak'))).toHaveLength(1);
  });

  it('keeps at most the newest devices per channel', async () => {
    const c = await signUp('bildirim-c@example.invalid');
    const cid = (await body(await meGet(api('/v1/me', c.token)))).id;
    const start = h.clock.now.getTime();
    for (let i = 0; i < PUSH_TARGETS_PER_CHANNEL + 2; i++) {
      h.clock.now = new Date(start + i * 1000);
      const r = await apnsTokenPost(
        api(
          '/v1/push/apns-tokens',
          c.token,
          json('POST', { deviceToken: token(100 + i), environment: 'production' }),
        ),
      );
      expect(r.status).toBe(201);
    }
    h.clock.now = new Date(start);
    const rows = await subs(cid);
    expect(rows).toHaveLength(PUSH_TARGETS_PER_CHANNEL);
    expect(rows.map((r) => r.endpoint)).not.toContain(token(100));
    expect(rows.map((r) => r.endpoint)).not.toContain(token(101));
    expect(rows.map((r) => r.endpoint)).toContain(token(100 + PUSH_TARGETS_PER_CHANNEL + 1));
  });

  it('registrations are rate limited per user', async () => {
    const d = await signUp('bildirim-d@example.invalid');
    const did = (await body(await meGet(api('/v1/me', d.token)))).id;
    for (let i = 0; i < rules.pushUser.limit; i++) await h.ctx.limiter.check(rules.pushUser, did);
    const r = await apnsTokenPost(
      api('/v1/push/apns-tokens', d.token, json('POST', { deviceToken: token(999), environment: 'sandbox' })),
    );
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('commercial message consent on /hesap/bildirimler', () => {
  it('shows the acik-riza.md consent sentence word for word', () => {
    const md = readFileSync(
      new URL('../../../../../../content/hukuki/tr/acik-riza.md', import.meta.url),
      'utf8',
    ).replace(/\s+/g, ' ');
    expect(md).toContain(`"${tr.sayfa.bildirimler.ticari.onay}"`);
  });

  it('reads the latest acik_riza_pazarlama row and the current text version', async () => {
    const e = await signUp('bildirim-e@example.invalid');
    const eid = (await body(await meGet(api('/v1/me', e.token)))).id;
    const first = await marketingConsent(h.ctx, eid);
    expect(first.granted).toBe(false);
    expect(first.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    const give = (granted: boolean) =>
      consentsPost(
        api(
          '/v1/me/consents',
          e.token,
          json('POST', { kind: 'acik_riza_pazarlama', version: first.version, granted }),
        ),
      );
    expect((await give(true)).status).toBe(201);
    expect((await marketingConsent(h.ctx, eid)).granted).toBe(true);
    h.clock.now = new Date(h.clock.now.getTime() + 1000);
    expect((await give(false)).status).toBe(201);
    expect((await marketingConsent(h.ctx, eid)).granted).toBe(false);
  });
});
