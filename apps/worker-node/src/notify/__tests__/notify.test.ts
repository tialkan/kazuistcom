import { generateKeyPairSync, verify } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dispatch, render, type NotifyDeps } from '../dispatch.ts';
import { channelAllows } from '../prefs.ts';
import { isQuietHour, nextSendTime } from '../quiet-hours.ts';
import { apnsJwt, MemoryEmail, MemoryPush } from '../transports.ts';

let pg: PGlite;
let userId: string;
const email = new MemoryEmail();
const push = new MemoryPush();
// 12:00 Istanbul (UTC+3) on a weekday.
const noon = new Date('2026-10-20T09:00:00Z');

const deps = (over: Partial<NotifyDeps> = {}): NotifyDeps => ({
  db: pg,
  email,
  webPush: push,
  apns: push,
  iys: { allowsEmail: async () => true },
  now: () => noon,
  appUrl: 'https://kazuist.com',
  ...over,
});

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder });
  const r = await pg.query<{ id: string }>(
    `insert into users (email) values ('n@example.invalid') returning id`,
  );
  userId = r.rows[0]?.id ?? '';
  await pg.query(`insert into notification_prefs (user_id) values ($1)`, [userId]);
  await pg.query(
    `insert into push_subscriptions (user_id, channel, endpoint, keys) values ($1, 'web_push', 'https://push.example.invalid/1', '{"p256dh":"x","auth":"y"}')`,
    [userId],
  );
  await pg.query(
    `insert into push_subscriptions (user_id, channel, endpoint, environment) values ($1, 'apns', 'devtoken1', 'sandbox')`,
    [userId],
  );
}, 60_000);
afterAll(async () => {
  await pg.close();
});

describe('quiet hours 22-08 Europe/Istanbul', () => {
  it('detects the window in Istanbul time', () => {
    expect(isQuietHour(new Date('2026-10-20T18:59:00Z'))).toBe(false); // 21:59
    expect(isQuietHour(new Date('2026-10-20T19:00:00Z'))).toBe(true); // 22:00
    expect(isQuietHour(new Date('2026-10-21T04:59:00Z'))).toBe(true); // 07:59
    expect(isQuietHour(new Date('2026-10-21T05:00:00Z'))).toBe(false); // 08:00
  });
  it('next send time is 08:00 Istanbul', () => {
    expect(nextSendTime(new Date('2026-10-20T20:30:00Z')).toISOString()).toBe('2026-10-21T05:00:00.000Z');
    expect(nextSendTime(new Date('2026-10-21T01:15:00Z')).toISOString()).toBe('2026-10-21T05:00:00.000Z');
    expect(nextSendTime(noon)).toBe(noon);
  });
});

describe('preferences', () => {
  it('commercial is off by default; payment e-mail cannot be disabled', () => {
    const p = { email: { odeme: false, takip: false }, web_push: {}, apns: {} };
    expect(channelAllows(p, 'email', 'kampanya')).toBe(false);
    expect(channelAllows(p, 'email', 'odeme')).toBe(true);
    expect(channelAllows(p, 'email', 'takip')).toBe(false);
    expect(channelAllows(p, 'web_push', 'takip')).toBe(true);
  });
});

describe('dispatch', () => {
  it('sends informational notices on every channel', async () => {
    const r = await dispatch(deps(), { type: 'takip', userId });
    expect(r.status).toBe('sent');
    expect(r.sent.sort()).toEqual(['apns', 'email', 'web_push']);
    expect(email.sent.at(-1)?.to).toBe('n@example.invalid');
    expect(email.sent.at(-1)?.listUnsubscribe).toBeUndefined();
  });

  it('defers to 08:00 in quiet hours and queues a new job', async () => {
    const night = new Date('2026-10-20T20:00:00Z');
    const r = await dispatch(deps({ now: () => night }), { type: 'kalemcik', userId });
    expect(r).toMatchObject({ status: 'deferred', runAfter: '2026-10-21T05:00:00.000Z' });
    const q = await pg.query<{ n: number }>(
      `select count(*)::int n from jobs where type = 'notify.send' and status = 'queued'`,
    );
    expect(q.rows[0]?.n).toBe(1);
  });

  it('payment notices are exempt from quiet hours', async () => {
    const night = new Date('2026-10-20T20:00:00Z');
    expect((await dispatch(deps({ now: () => night }), { type: 'odeme', userId })).status).toBe('sent');
  });

  it.each([
    ['odeme', 'odeme_alindi:order:12345', ['123,45']],
    ['odeme', 'odeme_7_gun:subscription:34900:2026-11-01T00:00:00Z', ['349,00', '1 Kasım 2026']],
    ['fesih_teyidi', 'fesih_teyidi:subscription:donem_sonu:2026-11-01T00:00:00Z', ['1 Kasım 2026']],
    ['fesih_teyidi', 'fesih_teyidi:subscription:hemen:2026-10-25T00:00:00Z', []],
  ] as const)('sends billing reference details by email (%s, %s)', async (type, refId, details) => {
    await dispatch(deps(), { type, refId, userId, channels: ['email'] });
    const message = email.sent.at(-1);
    const rendered = render(type, refId);
    expect(message?.subject).toBe(rendered.title);
    expect(message?.text).toContain(rendered.body);
    expect(rendered.body).not.toBe(render(type).body);
    for (const detail of details) expect(message?.text).toContain(detail);
    expect(message?.text).not.toMatch(/\{(?:tutar|tarih)\}/);
  });

  it('keeps cancellation modes distinct and falls back only for unsupported references', () => {
    expect(render('fesih_teyidi', 'fesih_teyidi:sub:hemen:2026-11-01').body).not.toBe(
      render('fesih_teyidi', 'fesih_teyidi:sub:donem_sonu:2026-11-01').body,
    );
    expect(render('odeme', 'unknown:ref')).toEqual(render('odeme'));
    expect(render('odeme', 'odeme_7_gun:sub:bad:bad')).toEqual(render('odeme'));
    expect(render('takip', 'odeme_alindi:order:12345')).toEqual(render('takip'));
  });

  it('commercial needs consent and IYS', async () => {
    expect((await dispatch(deps(), { type: 'kampanya', userId })).reason).toBe('commercial_not_allowed');
    await pg.query(
      `insert into consents (user_id, user_hash, kind, version, granted) values ($1, 'h', 'acik_riza_pazarlama', 'v1', true)`,
      [userId],
    );
    expect(
      (await dispatch(deps({ iys: { allowsEmail: async () => false } }), { type: 'kampanya', userId }))
        .reason,
    ).toBe('commercial_not_allowed');
    // Consent and IYS present, but the channel preference for commercial defaults to off.
    expect((await dispatch(deps(), { type: 'kampanya', userId })).status).toBe('skipped');
    await pg.query(`update notification_prefs set email = '{"kampanya": true}' where user_id = $1`, [userId]);
    const r = await dispatch(deps(), { type: 'kampanya', userId, channels: ['email'] });
    expect(r.sent).toEqual(['email']);
    expect(email.sent.at(-1)?.listUnsubscribe).toBe('https://kazuist.com/hesap/bildirimler');
    await pg.query(
      `insert into consents (user_id, user_hash, kind, version, granted) values ($1, 'h', 'acik_riza_pazarlama', 'v1', false)`,
      [userId],
    );
    expect((await dispatch(deps(), { type: 'kampanya', userId })).reason).toBe('commercial_not_allowed');
  });

  it('removes expired push subscriptions', async () => {
    push.gone.add('https://push.example.invalid/1');
    await dispatch(deps(), { type: 'takip', userId });
    const q = await pg.query<{ n: number }>(
      `select count(*)::int n from push_subscriptions where channel = 'web_push'`,
    );
    expect(q.rows[0]?.n).toBe(0);
  });

  it('rejects payloads with personal data fields', async () => {
    await expect(dispatch(deps(), { type: 'takip', userId, email: 'x@example.invalid' })).rejects.toThrow();
  });
});

describe('APNs provider token', () => {
  it('is an ES256 JWT that verifies with the key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwt = apnsJwt(
      {
        keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        keyId: 'KEY123',
        teamId: 'TEAM123',
        bundleId: 'com.kazuist.app',
      },
      1_800_000_000,
    );
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h ?? '', 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY123' });
    expect(JSON.parse(Buffer.from(c ?? '', 'base64url').toString())).toEqual({
      iss: 'TEAM123',
      iat: 1_800_000_000,
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${h}.${c}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(s ?? '', 'base64url'),
      ),
    ).toBe(true);
  });
});
