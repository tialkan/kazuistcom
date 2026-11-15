import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimJobsSql, completeJobSql, failJobSql, jobsChannel } from '../src/jobs.ts';
import { migrationsFolder } from '../src/migrate.ts';

let pg: PGlite;

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder });
}, 60_000);

afterAll(async () => {
  await pg.close();
});

const one = async <T>(q: string, params: unknown[] = []) => (await pg.query<T>(q, params)).rows[0] as T;

describe('initial migration on PGlite (PostgreSQL 18 wasm)', () => {
  it('installs vector and pg_trgm', async () => {
    const rows = (await pg.query<{ extname: string }>('select extname from pg_extension order by 1')).rows;
    expect(rows.map((r) => r.extname)).toEqual(expect.arrayContaining(['vector', 'pg_trgm']));
  });

  it('creates every table, including the kampus schema', async () => {
    const r = await one<{ n: number }>(
      "select count(*)::int n from information_schema.tables where table_schema in ('public','kampus') and table_type = 'BASE TABLE'",
    );
    expect(r.n).toBe(80);
    const k = await one<{ n: number }>(
      "select count(*)::int n from information_schema.tables where table_schema = 'kampus'",
    );
    expect(k.n).toBe(8);
  });

  it("uses halfvec(1024) and the 'turkish' text search configuration", async () => {
    const col = await one<{ t: string }>(
      "select format_type(atttypid, atttypmod) t from pg_attribute where attrelid = 'chunks'::regclass and attname = 'embedding'",
    );
    expect(col.t).toBe('halfvec(1024)');
    const cfg = await one<{ n: number }>(
      "select count(*)::int n from pg_ts_config where cfgname = 'turkish'",
    );
    expect(cfg.n).toBe(1);

    const rec = await one<{ id: string }>(
      `insert into records (type, title, authority_class, license_basis, source_url, source_key, fetched_at, text)
       values ('karar', 'Ornek karar', 'emsal', 'FSEK m.31', 'https://example.invalid/k/1', 'test:1', now(), 'metin')
       returning id`,
    );
    const vec = `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
    await pg.query(
      `insert into chunks (record_id, seq, text, embedding, char_start, char_end)
       values ($1, 0, 'Kararların bozulması halinde', $2::halfvec, 0, 28)`,
      [rec.id, vec],
    );
    const hit = await one<{ n: number }>(
      "select count(*)::int n from chunks where tsv @@ plainto_tsquery('turkish', 'kararlar bozulması')",
    );
    expect(hit.n).toBe(1);
    const near = await one<{ d: number }>(`select (embedding <=> $1::halfvec) d from chunks limit 1`, [vec]);
    expect(near.d).toBeCloseTo(0, 3);
  });

  it('keeps ledger entries balanced and immutable', async () => {
    const user = await one<{ id: string }>(
      "insert into users (email) values ('a@example.invalid') returning id",
    );
    const wallet = await one<{ id: string }>('insert into wallets (user_id) values ($1) returning id', [
      user.id,
    ]);
    const a = await one<{ id: string }>(
      "insert into ledger_accounts (kind, wallet_id, code) values ('kullanici_cuzdani', $1, 'w:1') returning id",
      [wallet.id],
    );
    const b = await one<{ id: string }>(
      "insert into ledger_accounts (kind, code) values ('promosyon_havuzu', 'promo') returning id",
    );
    const tx = '00000000-0000-4000-8000-000000000001';
    await pg.query(
      "insert into ledger_transactions (id, kind, idempotency_key) values ($1,'yukleme','k1'),('00000000-0000-4000-8000-000000000002','tuketim','k2')",
      [tx],
    );
    await pg.transaction(async (t) => {
      await t.query(
        "insert into ledger_entries (transaction_id, account_id, side, credits, kind) values ($1,$2,'borc',50,'yukleme'),($1,$3,'alacak',50,'yukleme')",
        [tx, b.id, a.id],
      );
    });
    await expect(
      pg.transaction(async (t) => {
        await t.query(
          "insert into ledger_entries (transaction_id, account_id, side, credits, kind) values ('00000000-0000-4000-8000-000000000002',$1,'borc',10,'tuketim')",
          [a.id],
        );
      }),
    ).rejects.toThrow(/unbalanced/);
    await expect(pg.query('update ledger_entries set credits = 1')).rejects.toThrow(/append only/);
    await expect(pg.query('delete from ledger_entries')).rejects.toThrow(/append only/);
  });

  it('records one spend across a promotion lot and a pack lot under one idempotency key', async () => {
    const user = await one<{ id: string }>(
      "insert into users (email) values ('b@example.invalid') returning id",
    );
    const wallet = await one<{ id: string }>('insert into wallets (user_id) values ($1) returning id', [
      user.id,
    ]);
    const w = await one<{ id: string }>(
      "insert into ledger_accounts (kind, wallet_id, code) values ('kullanici_cuzdani', $1, 'w:2') returning id",
      [wallet.id],
    );
    const use = await one<{ id: string }>(
      "insert into ledger_accounts (kind, code) values ('tuketim', 'tuketim') returning id",
    );
    const promo = await one<{ id: string }>(
      "insert into credit_lots (wallet_id, source, original_credits, remaining_credits, expires_at, origin_ref) values ($1,'promosyon',5,5,now() + interval '90 days','promo:b') returning id",
      [wallet.id],
    );
    const pack = await one<{ id: string }>(
      "insert into credit_lots (wallet_id, source, original_credits, remaining_credits, origin_ref) values ($1,'paket',300,300,'order:b') returning id",
      [wallet.id],
    );
    const spend = async () =>
      pg.transaction(async (t) => {
        const created = await t.query<{ id: string }>(
          "insert into ledger_transactions (kind, idempotency_key) values ('tuketim','req-123') returning id",
        );
        const tx = created.rows[0]?.id;
        await t.query(
          `insert into ledger_entries (transaction_id, account_id, side, credits, lot_id, kind) values
           ($1,$2,'alacak',5,$4,'tuketim'),($1,$2,'alacak',3,$5,'tuketim'),($1,$3,'borc',8,null,'tuketim')`,
          [tx, w.id, use.id, promo.id, pack.id],
        );
      });
    await spend();
    const n = await one<{ n: number }>(
      "select count(*)::int n from ledger_entries e join ledger_transactions t on t.id = e.transaction_id where t.idempotency_key = 'req-123'",
    );
    expect(n.n).toBe(3);
    await expect(spend()).rejects.toThrow(/duplicate key/);
  });

  it('keeps consents and audit log append only and preserves them on account deletion', async () => {
    const u = await one<{ id: string }>(
      "insert into users (email) values ('c@example.invalid') returning id",
    );
    await pg.query(
      "insert into consents (user_id, user_hash, kind, version, granted) values ($1,'h:c','aydinlatma','1',true)",
      [u.id],
    );
    await pg.query(
      "insert into audit_log (actor_id, actor_hash, action, subject_type) values ($1,'h:c','x','user')",
      [u.id],
    );
    await expect(pg.query("update consents set granted = false where user_hash = 'h:c'")).rejects.toThrow(
      /append only/,
    );
    await expect(pg.query("delete from audit_log where actor_hash = 'h:c'")).rejects.toThrow(/append only/);
    await pg.query('delete from users where id = $1', [u.id]);
    const c = await one<{ user_id: string | null }>("select user_id from consents where user_hash = 'h:c'");
    expect(c.user_id).toBeNull();
    const a = await one<{ n: number }>(
      "select count(*)::int n from audit_log where actor_hash = 'h:c' and actor_id is null",
    );
    expect(a.n).toBe(1);
  });

  it('allows one active job per dedupe key', async () => {
    const ins = "insert into jobs (type, dedupe_key) values ('embed.chunks', 'rec:1')";
    await pg.query(ins);
    await expect(pg.query(ins)).rejects.toThrow(/duplicate key/);
    await pg.query("update jobs set status = 'done' where dedupe_key = 'rec:1'");
    await pg.query(ins);
  });

  it('enforces webhook and idempotency unique keys', async () => {
    const ins =
      "insert into webhook_events (provider, event_id, event_type, signature_valid, payload) values ('iyzico','e1','x',true,'{}')";
    await pg.query(ins);
    await expect(pg.query(ins)).rejects.toThrow(/duplicate key/);
  });

  it('claims jobs with FOR UPDATE SKIP LOCKED and notifies jobs_<type>', async () => {
    const received: string[] = [];
    const unlisten = await pg.listen(jobsChannel('anon.run'), (payload) => received.push(payload));
    const job = await one<{ id: string }>(
      'insert into jobs (type, payload) values (\'anon.run\', \'{"recordId":"r1"}\') returning id',
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toContain(job.id);
    await unlisten();

    const claimed = (await pg.query<{ id: string; attempts: number }>(claimJobsSql, ['anon.run', 'w1', 10]))
      .rows;
    expect(claimed.map((c) => c.id)).toEqual([job.id]);
    expect(claimed[0]?.attempts).toBe(1);
    expect((await pg.query(claimJobsSql, ['anon.run', 'w2', 10])).rows).toHaveLength(0);

    const requeued: string[] = [];
    const un2 = await pg.listen(jobsChannel('anon.run'), (p) => requeued.push(p));
    await pg.query(failJobSql, [job.id, 'boom', 'w1']);
    await new Promise((r) => setTimeout(r, 50));
    expect(requeued).toContain(job.id);
    await un2();
    const failed = await one<{ status: string }>('select status from jobs where id = $1', [job.id]);
    expect(failed.status).toBe('queued');
    await pg.query("update jobs set run_after = now() - interval '1 second' where id = $1", [job.id]);
    await pg.query(claimJobsSql, ['anon.run', 'w1', 1]);
    await pg.query(completeJobSql, [job.id, '{"ok":true}', 'w1']);
    const done = await one<{ status: string }>('select status from jobs where id = $1', [job.id]);
    expect(done.status).toBe('done');
  });
});
