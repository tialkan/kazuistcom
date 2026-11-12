import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  INVALID_PAYLOAD_ERROR,
  InvalidJobPayload,
  JOB_PRUNE_BATCH,
  JOB_RETENTION_DAYS,
  JOB_STALE_SECONDS,
  buryJobSql,
  claimJobsSql,
  completeJobSql,
  deliveredTargetsSql,
  enqueueJob,
  enqueueJobSql,
  enqueueOnceSql,
  failJobSql,
  heartbeatJobSql,
  pruneJobsSql,
  recordDeliverySql,
  releaseStaleJobsSql,
} from '../src/jobs.ts';
import { migrationsFolder } from '../src/migrate.ts';

let pg: PGlite;
let folder: string;
let recA: string;
let recB: string;
const edges: Record<string, string> = {};
const one = async <T>(q: string, v: unknown[] = []) => (await pg.query<T>(q, v)).rows[0] as T;
const rows = async <T>(q: string, v: unknown[] = []) => (await pg.query<T>(q, v)).rows;

async function record(key: string, esas: string | null = null, karar: string | null = null) {
  return (
    await one<{ id: string }>(
      `insert into records (type, title, authority_class, license_basis, source_url, source_key, fetched_at, text, esas_no, karar_no)
       values ('karar', 'Ornek', 'emsal', 'FSEK m.31', 'https://example.invalid/' || $1, $1, now(), 'metin', $2, $3)
       returning id`,
      [key, esas, karar],
    )
  ).id;
}
async function edge(toRaw: string, confirmed: boolean, confidence: number) {
  return (
    await one<{ id: string }>(
      `insert into citation_edges (from_record_id, to_record_id, to_raw, confidence, confirmed, extractor)
       values ($1, $2, $3, $4, $5, 'kural') returning id`,
      [recA, recB, toRaw, confidence, confirmed],
    )
  ).id;
}

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'kazuist-v15-'));
  cpSync(migrationsFolder, folder, { recursive: true });
  const path = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(path, 'utf8')) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag < '0007');
  writeFileSync(path, JSON.stringify(journal));
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder: folder });
  // A populated v1.4 database: decisions, edges in the three states of the old convention, a finished daily job.
  recA = await record('v15:a', '2019/123 E.', '2020/45 K.');
  recB = await record('v15:b', '2018/1 E.', '2019/2 K.');
  edges.rejected = await edge('ret', true, 0);
  edges.confirmed = await edge('onay', true, 0.95);
  edges.open = await edge('acik', false, 0);
  await pg.query(
    "insert into jobs (type, payload, status, dedupe_key) values ('billing.monthly_grant', '{}', 'done', 'billing.monthly_grant:2026-11-11')",
  );
  await migrate(drizzle(pg), { migrationsFolder });
  await migrate(drizzle(pg), { migrationsFolder });
}, 60_000);

afterAll(async () => {
  await pg.close();
  rmSync(folder, { recursive: true, force: true });
});

describe('migration 0007 on a populated v1.4 database', () => {
  it('marks the old rejection convention as rejected and leaves every other edge alone', async () => {
    const got = await rows<{ id: string; confirmed: boolean; confidence: number; rejected: boolean }>(
      'select id, confirmed, confidence, rejected from citation_edges order by to_raw',
    );
    const by = Object.fromEntries(got.map((r) => [r.id, r]));
    expect(by[edges.rejected as string]).toMatchObject({ confirmed: true, confidence: 0, rejected: true });
    expect(by[edges.confirmed as string]).toMatchObject({ confirmed: true, rejected: false });
    expect(by[edges.open as string]).toMatchObject({ confirmed: false, confidence: 0, rejected: false });
    const fresh = await edge('yeni', false, 0.5);
    expect(
      (await one<{ rejected: boolean }>('select rejected from citation_edges where id = $1', [fresh]))
        .rejected,
    ).toBe(false);
  });

  it('adds works.work_key (unique, nullable) and work_citations with the extractor upserts', async () => {
    const work = async (key: string | null) =>
      (
        await one<{ id: string }>("insert into works (title, work_key) values ('Eser', $1) returning id", [
          key,
        ])
      ).id;
    const w1 = await work('kaya|borclar hukuku');
    await work(null);
    await work(null);
    await expect(work('kaya|borclar hukuku')).rejects.toThrow(/duplicate key/);
    // services/worker-py/citations/store.py UPSERT_WORK_SQL and UPSERT_WORK_CITATION_SQL.
    const up = await one<{ id: string }>(
      `insert into works (work_key, title, authors, csl) values ('kaya|borclar hukuku', 'Eser', '["Kaya"]', '{"kind":"kitap"}')
       on conflict (work_key) do update set csl = excluded.csl, authors = excluded.authors returning id`,
    );
    expect(up.id).toBe(w1);
    const cite = `insert into work_citations (from_record_id, work_id, pages, confidence, confirmed, extractor)
      values ($1, $2, $3::jsonb, 0.8, false, 'kural')
      on conflict (from_record_id, work_id) do update set pages = excluded.pages, confidence = excluded.confidence
      where work_citations.confirmed = false returning id`;
    const c1 = await one<{ id: string }>(cite, [recA, w1, '["12"]']);
    const c2 = await one<{ id: string }>(cite, [recA, w1, '["12","14"]']);
    expect(c2.id).toBe(c1.id);
    expect(await one('select pages, rejected, confirmed from work_citations where id = $1', [c1.id])).toEqual(
      { pages: ['12', '14'], rejected: false, confirmed: false },
    );
    const bare = await one<{ pages: unknown }>(
      "insert into work_citations (from_record_id, work_id, confidence, extractor) values ($1, $2, 0.9, 'kural') returning pages",
      [recB, w1],
    );
    expect(bare.pages).toEqual([]);
    await expect(
      pg.query(
        "insert into work_citations (from_record_id, work_id, confidence, extractor) values ($1, gen_random_uuid(), 0.9, 'kural')",
        [recA],
      ),
    ).rejects.toThrow(/foreign key/);
    const temp = await record('v15:temp');
    await pg.query(
      "insert into work_citations (from_record_id, work_id, confidence, extractor) values ($1, $2, 0.9, 'kural')",
      [temp, w1],
    );
    await pg.query('delete from records where id = $1', [temp]);
    expect(
      (
        await one<{ n: number }>('select count(*)::int n from work_citations where from_record_id = $1', [
          temp,
        ])
      ).n,
    ).toBe(0);
  });

  it('creates the lookup and queue indexes', async () => {
    const idx = Object.fromEntries(
      (
        await rows<{ indexname: string; indexdef: string }>(
          "select indexname, indexdef from pg_indexes where indexname in ('records_esas_key_idx','records_karar_key_idx','sources_raw_record_idx','jobs_dedupe_idx','jobs_finished_idx','work_citations_work_idx')",
        )
      ).map((r) => [r.indexname, r.indexdef]),
    );
    expect(Object.keys(idx).sort()).toEqual([
      'jobs_dedupe_idx',
      'jobs_finished_idx',
      'records_esas_key_idx',
      'records_karar_key_idx',
      'sources_raw_record_idx',
      'work_citations_work_idx',
    ]);
    expect(idx.records_esas_key_idx).toContain("replace(esas_no, ' '::text, ''::text)");
    expect(idx.jobs_dedupe_idx).not.toContain('UNIQUE');
    // The lookup of citations/store.py FIND_SQL matches the index expression.
    const hit = await rows<{ id: string }>(
      "select id from records where replace(esas_no, ' ', '') = '2019/123E.' and replace(karar_no, ' ', '') = '2020/45K.'",
    );
    expect(hit.map((r) => r.id)).toEqual([recA]);
  });
});

describe('notification_deliveries', () => {
  const hash = 'a'.repeat(64);
  it('keeps one row per job, channel and target, refuses raw targets and goes with its job', async () => {
    const job = (
      await one<{ id: string }>(
        `insert into jobs (type, payload) values ('notify.send', '{"type":"odeme","userId":"00000000-0000-4000-8000-000000000001"}') returning id`,
      )
    ).id;
    await pg.query(recordDeliverySql, [job, 'email', 'email']);
    await pg.query(recordDeliverySql, [job, 'email', 'email']);
    await pg.query(recordDeliverySql, [job, 'web_push', hash]);
    expect(await rows(deliveredTargetsSql, [job])).toHaveLength(2);
    await expect(
      pg.query(recordDeliverySql, [job, 'web_push', 'https://push.example.invalid/abc']),
    ).rejects.toThrow(/notification_deliveries_target/);
    await expect(pg.query(recordDeliverySql, [job, 'apns', 'email'])).rejects.toThrow(
      /notification_deliveries_target/,
    );
    await expect(pg.query(recordDeliverySql, [job, 'sms', hash])).rejects.toThrow(
      /notification_deliveries_channel/,
    );
    await expect(pg.query(recordDeliverySql, [job, 'email', hash])).rejects.toThrow(
      /notification_deliveries_target/,
    );
    await pg.query('delete from jobs where id = $1', [job]);
    expect(await rows(deliveredTargetsSql, [job])).toHaveLength(0);
  });
});

describe('job queue v1.5 (ADR-0035)', () => {
  beforeEach(async () => {
    await pg.query("delete from jobs where type <> 'billing.monthly_grant' or dedupe_key is null");
  });
  const enqueue = async (type = 'anon.run', maxAttempts = 5) =>
    (
      await one<{ id: string }>(
        `insert into jobs (type, payload, max_attempts) values ($1, '{"recordId":"00000000-0000-4000-8000-000000000001"}', $2) returning id`,
        [type, maxAttempts],
      )
    ).id;
  const age = (id: string, seconds: number) =>
    pg.query('update jobs set locked_at = now() - make_interval(secs => $2) where id = $1', [id, seconds]);
  const state = (id: string) =>
    one<{ status: string; locked_by: string | null; error: string | null; attempts: number }>(
      'select status, locked_by, error, attempts from jobs where id = $1',
      [id],
    );

  it('a worker that lost its lock can neither complete, fail, bury nor renew the job', async () => {
    const id = await enqueue();
    expect(await rows(claimJobsSql, ['anon.run', 'w1', 1])).toHaveLength(1);
    await age(id, JOB_STALE_SECONDS + 60);
    expect(await rows(releaseStaleJobsSql, [JOB_STALE_SECONDS])).toEqual([{ id, status: 'queued' }]);
    expect(await state(id)).toMatchObject({ status: 'queued', locked_by: null, error: 'stale lock' });
    expect(await rows(claimJobsSql, ['anon.run', 'w2', 1])).toHaveLength(1);
    expect(await rows(completeJobSql, [id, '{"ok":1}', 'w1'])).toEqual([]);
    expect(await rows(failJobSql, [id, 'Boom', 'w1'])).toEqual([]);
    expect(await rows(buryJobSql, [id, INVALID_PAYLOAD_ERROR, 'w1'])).toEqual([]);
    expect(await rows(heartbeatJobSql, [id, 'w1'])).toEqual([]);
    expect(await state(id)).toMatchObject({ status: 'running', locked_by: 'w2', attempts: 2 });
    expect(await rows(completeJobSql, [id, '{"ok":2}', 'w2'])).toEqual([{ id }]);
    expect(await state(id)).toMatchObject({ status: 'done', locked_by: null });
  });

  it('a heartbeat keeps a long job from being released', async () => {
    const id = await enqueue();
    await pg.query(claimJobsSql, ['anon.run', 'w1', 1]);
    await age(id, JOB_STALE_SECONDS - 10);
    expect(await rows(heartbeatJobSql, [id, 'w1'])).toEqual([{ id }]);
    expect(await rows(releaseStaleJobsSql, [JOB_STALE_SECONDS])).toEqual([]);
    const fresh = await one<{ s: number }>(
      'select extract(epoch from now() - locked_at)::float8 s from jobs where id = $1',
      [id],
    );
    expect(fresh.s).toBeLessThan(5);
    // Without the beat the same age is released.
    await age(id, JOB_STALE_SECONDS + 10);
    expect(await rows(releaseStaleJobsSql, [JOB_STALE_SECONDS])).toHaveLength(1);
  });

  it('a stale job whose attempts are used up is buried, not requeued forever', async () => {
    const id = await enqueue('anon.run', 1);
    await pg.query(claimJobsSql, ['anon.run', 'w1', 1]);
    await age(id, JOB_STALE_SECONDS + 1);
    expect(await rows(releaseStaleJobsSql, [JOB_STALE_SECONDS])).toEqual([{ id, status: 'dead' }]);
    expect(await state(id)).toMatchObject({ status: 'dead', error: 'stale lock', attempts: 1 });
  });

  it('fail retries with backoff, then buries; bury skips the retries', async () => {
    const id = await enqueue('anon.run', 2);
    await pg.query(claimJobsSql, ['anon.run', 'w1', 1]);
    expect(await rows(failJobSql, [id, 'Boom', 'w1'])).toEqual([{ id, status: 'queued' }]);
    await pg.query("update jobs set run_after = now() - interval '1 second' where id = $1", [id]);
    await pg.query(claimJobsSql, ['anon.run', 'w1', 1]);
    expect(await rows(failJobSql, [id, 'Boom', 'w1'])).toEqual([{ id, status: 'dead' }]);
    const other = await enqueue();
    await pg.query(claimJobsSql, ['anon.run', 'w1', 1]);
    expect(await rows(buryJobSql, [other, INVALID_PAYLOAD_ERROR, 'w1'])).toEqual([{ id: other }]);
    expect(await state(other)).toMatchObject({ status: 'dead', error: 'invalid payload', attempts: 1 });
  });

  it('prunes finished rows past their retention only, in batches, with their deliveries', async () => {
    const at = async (status: string, days: number) =>
      (
        await one<{ id: string }>(
          `insert into jobs (type, payload, status, updated_at) values ('notify.send', '{}', $1, now() - make_interval(days => $2)) returning id`,
          [status, days],
        )
      ).id;
    const oldDone = await at('done', JOB_RETENTION_DAYS.done + 1);
    const newDone = await at('done', JOB_RETENTION_DAYS.done - 1);
    const oldDead = await at('dead', JOB_RETENTION_DAYS.dead + 1);
    const newDead = await at('dead', JOB_RETENTION_DAYS.dead - 1);
    const oldFailed = await at('failed', JOB_RETENTION_DAYS.dead + 1);
    const oldQueued = await at('queued', 365);
    const oldRunning = await at('running', 365);
    await pg.query(recordDeliverySql, [oldDone, 'email', 'email']);
    const args = [JOB_RETENTION_DAYS.done, JOB_RETENTION_DAYS.dead];
    expect(await one(pruneJobsSql, [...args, 1])).toEqual({ deleted: 1 });
    expect(await one(pruneJobsSql, [...args, JOB_PRUNE_BATCH])).toEqual({ deleted: 2 });
    expect(await one(pruneJobsSql, [...args, JOB_PRUNE_BATCH])).toEqual({ deleted: 0 });
    const left = (await rows<{ id: string }>('select id from jobs')).map((r) => r.id);
    expect(left).toEqual(expect.arrayContaining([newDone, newDead, oldQueued, oldRunning]));
    for (const gone of [oldDone, oldDead, oldFailed]) expect(left).not.toContain(gone);
    expect(await rows(deliveredTargetsSql, [oldDone])).toEqual([]);
  });

  it('enqueueOnce does not queue a key again after it ran, unlike the plain insert', async () => {
    const key = 'billing.monthly_grant:2026-11-11';
    // The row was done before the migration: a restarted producer must not queue the day again.
    expect(await rows(enqueueOnceSql, ['billing.monthly_grant', '{}', key, null])).toEqual([]);
    const next = 'billing.monthly_grant:2026-11-12';
    const first = await rows<{ id: string }>(enqueueOnceSql, ['billing.monthly_grant', '{}', next, null]);
    expect(first).toHaveLength(1);
    expect(await rows(enqueueOnceSql, ['billing.monthly_grant', '{}', next, null])).toEqual([]);
    await pg.query("update jobs set status = 'done' where id = $1", [first[0]?.id]);
    expect(await rows(enqueueOnceSql, ['billing.monthly_grant', '{}', next, null])).toEqual([]);
    // The plain insert only guards queued and running rows (jobs_dedupe_active_uq).
    expect(await rows(enqueueJobSql, ['billing.monthly_grant', '{}', next, null])).toHaveLength(1);
    expect(await rows(enqueueJobSql, ['billing.monthly_grant', '{}', next, null])).toEqual([]);
    // A key is required.
    expect(await rows(enqueueOnceSql, ['billing.monthly_grant', '{}', null, null])).toEqual([]);
    const later = await rows<{ run_after: Date }>(
      'select run_after from jobs where id = (select id from jobs where dedupe_key = $1 order by created_at limit 1)',
      [next],
    );
    expect(later).toHaveLength(1);
  });

  it('enqueueJob validates the payload against the contract before writing', async () => {
    const before = (await one<{ n: number }>('select count(*)::int n from jobs')).n;
    await expect(enqueueJob(pg, 'anon.run', { recordId: 'not-a-uuid' })).rejects.toBeInstanceOf(
      InvalidJobPayload,
    );
    await expect(enqueueJob(pg, 'notify.send', { type: 'odeme' } as never)).rejects.toThrow(
      /notify\.send \(invalid_payload\)/,
    );
    expect((await one<{ n: number }>('select count(*)::int n from jobs')).n).toBe(before);
    const id = await enqueueJob(
      pg,
      'kalemcik.daily',
      {},
      {
        once: true,
        dedupeKey: 'kalemcik.daily:2026-11-12',
        runAfter: new Date('2026-11-12T05:00:00Z'),
      },
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      await enqueueJob(pg, 'kalemcik.daily', {}, { once: true, dedupeKey: 'kalemcik.daily:2026-11-12' }),
    ).toBeNull();
    const row = await one<{ run_after: Date; payload: unknown }>(
      'select run_after, payload from jobs where id = $1',
      [id],
    );
    expect(new Date(row.run_after).toISOString()).toBe('2026-11-12T05:00:00.000Z');
    expect(row.payload).toEqual({});
  });
});
