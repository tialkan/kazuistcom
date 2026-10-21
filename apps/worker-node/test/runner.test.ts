import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildHandlers, dailyBillingTick, unavailableBilling } from '../src/handlers.ts';
import type { NotifyDeps } from '../src/notify/index.ts';
import { createConsumer, type JobHandler } from '../src/queue.ts';
import { startWorker, type Listen } from '../src/runner.ts';

let pg: PGlite;
const listen: Listen = async (channels, onNotify) => {
  const offs = await Promise.all(channels.map((c) => pg.listen(c, () => onNotify(c))));
  return async () => {
    for (const off of offs) await off();
  };
};
const until = async (cond: () => Promise<boolean>, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out');
};
const statusOf = async (id: string) =>
  (
    await pg.query<{ status: string; error: string | null }>('select status, error from jobs where id = $1', [
      id,
    ])
  ).rows[0];
const enqueue = async (type: string, payload: unknown = {}) =>
  (
    await pg.query<{ id: string }>('insert into jobs (type, payload) values ($1, $2::jsonb) returning id', [
      type,
      JSON.stringify(payload),
    ])
  ).rows[0]?.id as string;

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder });
}, 60_000);
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.query('delete from jobs');
});

describe('worker loop', () => {
  it('wakes on NOTIFY, runs the job and stops cleanly', async () => {
    const seen: unknown[] = [];
    const handler: JobHandler = async (job) => {
      seen.push(job.payload);
      return { ok: true };
    };
    const consumer = createConsumer(pg, 'w1', { 'notify.send': handler });
    const logs: string[] = [];
    const w = startWorker({ db: pg, consumer, listen, pollMs: 60_000, log: (m) => logs.push(m) });
    await until(async () => logs.includes('listening'));
    // The first poll round runs immediately; the next one is 60 s away, so only NOTIFY can wake the loop.
    await new Promise((r) => setTimeout(r, 50));
    const id = await enqueue('notify.send', {
      type: 'odeme',
      userId: '00000000-0000-4000-8000-000000000001',
    });
    await until(async () => (await statusOf(id))?.status === 'done');
    expect(seen).toHaveLength(1);
    await w.stop();
    expect(logs.at(-1)).toBe('stopped');
  });

  it('finishes the job in hand before stop resolves and claims nothing after', async () => {
    let release: () => void = () => {};
    let started = false;
    const gate = new Promise<void>((r) => (release = r));
    const consumer = createConsumer(pg, 'w2', {
      'notify.send': async () => {
        started = true;
        await gate;
        return { ok: true };
      },
    });
    const w = startWorker({ db: pg, consumer, listen, pollMs: 20 });
    const first = await enqueue('notify.send');
    await until(async () => started);
    let stopped = false;
    const stopping = w.stop().then(() => (stopped = true));
    const second = await enqueue('notify.send');
    await new Promise((r) => setTimeout(r, 50));
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect((await statusOf(first))?.status).toBe('done');
    expect((await statusOf(second))?.status).toBe('queued');
  });

  it('billing jobs fail closed until the billing store exists', async () => {
    const handlers = buildHandlers({ billing: unavailableBilling });
    expect(Object.keys(handlers).sort()).toEqual(['billing.monthly_grant', 'billing.reconcile']);
    const consumer = createConsumer(pg, 'w3', handlers);
    const id = await enqueue('billing.monthly_grant');
    expect(await consumer.runOnce('billing.monthly_grant')).toBe(1);
    expect(await statusOf(id)).toEqual({ status: 'queued', error: 'BillingStoreUnavailable' });
  });

  it('registers notify.send only with notify dependencies', () => {
    expect(Object.keys(buildHandlers({}))).toEqual([]);
    const notify = { db: pg, iys: { allowsEmail: async () => false }, appUrl: 'https://example.invalid' };
    expect(Object.keys(buildHandlers({ notify: notify as NotifyDeps }))).toEqual(['notify.send']);
  });
});

describe('daily billing schedule', () => {
  it('enqueues one grant and one reconcile per UTC day', async () => {
    let now = new Date('2026-10-20T03:00:00Z');
    const tick = dailyBillingTick(pg, () => now);
    await tick();
    await tick();
    now = new Date('2026-10-20T23:00:00Z');
    await tick();
    const rows = (
      await pg.query<{ type: string; dedupe_key: string; payload: unknown }>(
        'select type, dedupe_key, payload from jobs order by type',
      )
    ).rows;
    expect(rows).toEqual([
      { type: 'billing.monthly_grant', dedupe_key: 'billing.monthly_grant:2026-10-20', payload: {} },
      {
        type: 'billing.reconcile',
        dedupe_key: 'billing.reconcile:2026-10-20',
        payload: { day: '2026-10-19' },
      },
    ]);
    now = new Date('2026-10-21T03:00:00Z');
    await tick();
    expect((await pg.query('select 1 from jobs')).rows).toHaveLength(4);
  });
});
