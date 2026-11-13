import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { claimJobsSql, type ClaimedJob } from '@kazuist/db/jobs';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConsumer } from '../../queue.ts';
import { createNotifyHandler, deferKey, dispatch, PushDeliveryError, type NotifyDeps } from '../dispatch.ts';
import { notifyTargetKey, targetHash, targetKeyFromEnv } from '../target-hash.ts';
import { MemoryEmail, MemoryPush } from '../transports.ts';
import type { ApnsTransport, WebPushTransport } from '../types.ts';

/** ADR-0035: notification_deliveries makes notify.send idempotent per channel and target across retries. */

const WEB = 'https://push.example.invalid/sub-1';
const TOKEN = 'a1b2c3devicetoken';
const key = notifyTargetKey('test-only-secret-not-a-real-value');
const noon = new Date('2026-10-20T09:00:00Z');
const night = new Date('2026-10-20T20:00:00Z');

let pg: PGlite;
let userId: string;

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder });
  const r = await pg.query<{ id: string }>(
    `insert into users (email) values ('i@example.invalid') returning id`,
  );
  userId = r.rows[0]?.id ?? '';
  await pg.query(`insert into notification_prefs (user_id) values ($1)`, [userId]);
}, 60_000);
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.query('delete from jobs');
  await pg.query('delete from push_subscriptions');
  await pg.query(
    `insert into push_subscriptions (user_id, channel, endpoint, keys) values ($1, 'web_push', $2, '{"p256dh":"x","auth":"y"}')`,
    [userId, WEB],
  );
  await pg.query(
    `insert into push_subscriptions (user_id, channel, endpoint, environment) values ($1, 'apns', $2, 'sandbox')`,
    [userId, TOKEN],
  );
});

async function claimedJob(payload: object, maxAttempts = 5): Promise<ClaimedJob> {
  await pg.query(`insert into jobs (type, payload, max_attempts) values ('notify.send', $1::jsonb, $2)`, [
    JSON.stringify(payload),
    maxAttempts,
  ]);
  const { rows } = await pg.query<ClaimedJob>(claimJobsSql, ['notify.send', 'test-worker', 1]);
  const job = rows[0];
  if (!job) throw new Error('no job claimed');
  return job;
}

const deliveries = async (jobId: string) =>
  (
    await pg.query<{ channel: string; target_hash: string }>(
      'select channel, target_hash from notification_deliveries where job_id = $1 order by channel',
      [jobId],
    )
  ).rows;

/** A web push transport that fails a given number of times, then delivers. */
function flakyWebPush(failures: number): WebPushTransport & { calls: number } {
  const t = {
    calls: 0,
    async send() {
      t.calls++;
      if (t.calls <= failures) throw new Error('provider down');
      return 'ok' as const;
    },
  };
  return t;
}

const base = (over: Partial<NotifyDeps>): NotifyDeps => ({
  db: pg,
  iys: { allowsEmail: async () => false },
  now: () => noon,
  appUrl: 'https://kazuist.com',
  targetKey: key,
  ...over,
});

describe('target hash', () => {
  it('is 64 lower case hex, keyed, and never the raw value', () => {
    const h = targetHash(key, WEB);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('push.example');
    expect(targetHash(key, WEB)).toBe(h);
    expect(targetHash(notifyTargetKey('another-test-secret'), WEB)).not.toBe(h);
    expect(targetHash(key, TOKEN)).not.toBe(h);
  });

  it('derives the key from BETTER_AUTH_SECRET only when it is set', () => {
    expect(targetKeyFromEnv({})).toBeUndefined();
    expect(targetKeyFromEnv({ BETTER_AUTH_SECRET: 'test-only' })).toEqual(notifyTargetKey('test-only'));
  });
});

describe('dispatch with a job: delivery record', () => {
  it('records e-mail as target email and push targets as hashes, never raw endpoints', async () => {
    const email = new MemoryEmail();
    const push = new MemoryPush();
    const job = await claimedJob({ type: 'takip', userId });
    const r = await dispatch(base({ email, webPush: push, apns: push }), job.payload, job);
    expect(r.status).toBe('sent');
    const rows = await deliveries(job.id);
    expect(rows).toEqual([
      { channel: 'apns', target_hash: targetHash(key, TOKEN) },
      { channel: 'email', target_hash: 'email' },
      { channel: 'web_push', target_hash: targetHash(key, WEB) },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/push\.example|devicetoken|i@example/);
  });

  it('a second run of the same job delivers nothing again', async () => {
    const email = new MemoryEmail();
    const push = new MemoryPush();
    const deps = base({ email, webPush: push, apns: push });
    const job = await claimedJob({ type: 'takip', userId });
    await dispatch(deps, job.payload, job);
    const again = await dispatch(deps, job.payload, job);
    expect(again.status).toBe('sent');
    expect(again.sent.sort()).toEqual(['apns', 'email', 'web_push']);
    expect(email.sent).toHaveLength(1);
    expect(push.sent).toHaveLength(2);
    expect(await deliveries(job.id)).toHaveLength(3);
  });

  it('a push failure fails the job; the retry sends only the missing target', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const email = new MemoryEmail();
    const apnsPush = new MemoryPush();
    const apns: ApnsTransport = { send: (t, e, m) => apnsPush.send(t, e, m) };
    const webPush = flakyWebPush(1);
    const deps = base({ email, webPush, apns });
    const job = await claimedJob({ type: 'takip', userId });
    await expect(dispatch(deps, job.payload, job)).rejects.toBeInstanceOf(PushDeliveryError);
    expect((await deliveries(job.id)).map((d) => d.channel)).toEqual(['apns', 'email']);
    const r = await dispatch(deps, job.payload, { ...job, attempts: job.attempts + 1 });
    expect(r.status).toBe('sent');
    expect(r.reason).toBeUndefined();
    expect(r.sent.sort()).toEqual(['apns', 'email', 'web_push']);
    expect(email.sent).toHaveLength(1);
    expect(apnsPush.sent).toHaveLength(1);
    expect(webPush.calls).toBe(2);
    expect((await deliveries(job.id)).map((d) => d.channel)).toEqual(['apns', 'email', 'web_push']);
    log.mockRestore();
  });

  it('on the last attempt a partial delivery completes as push_partial', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const email = new MemoryEmail();
    const job = await claimedJob({ type: 'takip', userId, channels: ['email', 'web_push'] }, 1);
    const r = await dispatch(base({ email, webPush: flakyWebPush(9) }), job.payload, job);
    expect(r).toMatchObject({ status: 'sent', reason: 'push_partial', sent: ['email'] });
    log.mockRestore();
  });

  it('without a key push is sent best effort and not recorded; e-mail is still recorded', async () => {
    const prev = process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
    try {
      const email = new MemoryEmail();
      const push = new MemoryPush();
      const job = await claimedJob({ type: 'takip', userId });
      const r = await dispatch(
        base({ email, webPush: push, apns: push, targetKey: undefined }),
        job.payload,
        job,
      );
      expect(r.sent.sort()).toEqual(['apns', 'email', 'web_push']);
      expect(await deliveries(job.id)).toEqual([{ channel: 'email', target_hash: 'email' }]);
    } finally {
      if (prev !== undefined) process.env.BETTER_AUTH_SECRET = prev;
    }
  });
});

describe('quiet hours with a job', () => {
  it('defers through enqueueJob once per job, even when the deferral is retried', async () => {
    const job = await claimedJob({ type: 'kalemcik', userId });
    const deps = base({ email: new MemoryEmail(), now: () => night });
    const r = await dispatch(deps, job.payload, job);
    expect(r).toMatchObject({ status: 'deferred', runAfter: '2026-10-21T05:00:00.000Z' });
    await dispatch(deps, job.payload, job);
    const q = await pg.query<{ payload: unknown; dedupe_key: string; run_after: Date }>(
      `select payload, dedupe_key, run_after from jobs where type = 'notify.send' and status = 'queued'`,
    );
    expect(q.rows).toHaveLength(1);
    expect(q.rows[0]?.dedupe_key).toBe(deferKey(job.id));
    expect(q.rows[0]?.payload).toEqual({ type: 'kalemcik', userId });
    expect(new Date(q.rows[0]?.run_after ?? 0).toISOString()).toBe('2026-10-21T05:00:00.000Z');
  });

  it('a retry that already delivered something finishes now instead of deferring', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const email = new MemoryEmail();
    const webPush = flakyWebPush(1);
    const job = await claimedJob({ type: 'kalemcik', userId, channels: ['email', 'web_push'] });
    await expect(dispatch(base({ email, webPush }), job.payload, job)).rejects.toThrow();
    const r = await dispatch(base({ email, webPush, now: () => night }), job.payload, job);
    expect(r.status).toBe('sent');
    expect(email.sent).toHaveLength(1);
    const q = await pg.query(`select 1 from jobs where status = 'queued'`);
    expect(q.rows).toHaveLength(0);
    log.mockRestore();
  });
});

describe('consumer end to end', () => {
  it('a failed push retries through the queue without a second e-mail', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const email = new MemoryEmail();
    const webPush = flakyWebPush(1);
    const handler = createNotifyHandler(base({ email, webPush }));
    const consumer = createConsumer(pg, 'w-notify', { 'notify.send': handler }, { log: () => undefined });
    await pg.query(`insert into jobs (type, payload) values ('notify.send', $1::jsonb)`, [
      JSON.stringify({ type: 'takip', userId, channels: ['email', 'web_push'] }),
    ]);
    expect(await consumer.runOnce('notify.send')).toBe(1);
    const failed = await pg.query<{ id: string; status: string; error: string }>(
      'select id, status, error from jobs',
    );
    expect(failed.rows[0]).toMatchObject({ status: 'queued', error: 'PushDeliveryError' });
    await pg.query('update jobs set run_after = now()');
    expect(await consumer.runOnce('notify.send')).toBe(1);
    const done = await pg.query<{ status: string }>('select status from jobs');
    expect(done.rows[0]?.status).toBe('done');
    expect(email.sent).toHaveLength(1);
    expect(webPush.calls).toBe(2);
    expect(await deliveries(failed.rows[0]?.id ?? '')).toHaveLength(2);
    log.mockRestore();
  });
});
