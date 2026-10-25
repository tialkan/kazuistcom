import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationsFolder } from '../src/migrate.ts';

/**
 * Migration 0004 (contract v1.2, ADR-0026) applied on top of a v1.1 database that already holds a payment
 * whose status predates the CHECK, so NOT VALID is exercised as well as the new guards.
 */
let pg: PGlite;
let v11Folder: string;
let walletId: string;

const one = async <T>(q: string, params: unknown[] = []) => (await pg.query<T>(q, params)).rows[0] as T;
const count = async (q: string, params: unknown[] = []) =>
  (await one<{ n: number }>(`select count(*)::int n from (${q}) x`, params)).n;

beforeAll(async () => {
  v11Folder = mkdtempSync(join(tmpdir(), 'kazuist-v11-'));
  cpSync(migrationsFolder, v11Folder, { recursive: true });
  const journalPath = join(v11Folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag < '0004');
  writeFileSync(journalPath, JSON.stringify(journal));

  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder: v11Folder });

  const u = await one<{ id: string }>(
    "insert into users (email) values ('v11@example.invalid') returning id",
  );
  walletId = (await one<{ id: string }>('insert into wallets (user_id) values ($1) returning id', [u.id])).id;
  const pt = await one<{ id: string }>(
    "insert into price_tables (version, effective_from, operations) values ('v1', now(), '{}') returning id",
  );
  const prod = await one<{ id: string }>(
    "insert into products (code, kind, price_table_id, price_kurus, credits) values ('kredi.300', 'paket', $1, 100, 300) returning id",
    [pt.id],
  );
  const ord = await one<{ id: string }>(
    "insert into orders (user_id, product_id, amount_kurus, idempotency_key, consent_versions) values ($1, $2, 100, 'k', '{}') returning id",
    [u.id, prod.id],
  );
  // A status from before v1.2; NOT VALID keeps the row and the migration succeeds.
  await pg.query(
    "insert into payments (order_id, provider, provider_payment_id, amount_kurus, status) values ($1, 'iyzico', 'old-1', 100, 'odendi')",
    [ord.id],
  );

  await migrate(drizzle(pg), { migrationsFolder });
}, 60_000);

afterAll(async () => {
  await pg.close();
  rmSync(v11Folder, { recursive: true, force: true });
});

describe('migration 0004 on a v1.1 database', () => {
  it('keeps old rows and adds the CHECKs as NOT VALID', async () => {
    expect(await count("select 1 from payments where status = 'odendi'")).toBe(1);
    const cons = (
      await pg.query<{ conname: string; convalidated: boolean }>(
        "select conname, convalidated from pg_constraint where conname in ('payments_status', 'notices_kind') order by conname",
      )
    ).rows;
    expect(cons).toEqual([
      { conname: 'notices_kind', convalidated: false },
      { conname: 'payments_status', convalidated: false },
    ]);
  });

  it('checks new payment statuses and notice kinds', async () => {
    const ord = await one<{ id: string; user_id: string }>('select id, user_id from orders limit 1');
    await expect(
      pg.query(
        "insert into payments (order_id, provider, provider_payment_id, amount_kurus, status) values ($1, 'iyzico', 'new-1', 1, 'odendi')",
        [ord.id],
      ),
    ).rejects.toThrow(/payments_status/);
    await pg.query(
      "insert into payments (order_id, provider, provider_payment_id, amount_kurus, status) values ($1, 'iyzico', 'new-2', 1, 'hazir')",
      [ord.id],
    );
    await pg.query(
      "insert into notices (user_id, kind, ref, send_at) values ($1, 'odeme_7_gun', 'r', now())",
      [ord.user_id],
    );
    await expect(
      pg.query("insert into notices (user_id, kind, ref, send_at) values ($1, 'bilinmeyen', 'r', now())", [
        ord.user_id,
      ]),
    ).rejects.toThrow(/notices_kind/);
  });

  it('D6: ledger_transactions cannot be changed, deleted or truncated', async () => {
    await pg.query("insert into ledger_transactions (kind, idempotency_key) values ('yukleme', 'd6-1')");
    await expect(pg.query("update ledger_transactions set kind = 'iade'")).rejects.toThrow(/append only/);
    await expect(pg.query('delete from ledger_transactions')).rejects.toThrow(/append only/);
    await expect(pg.query('truncate ledger_transactions cascade')).rejects.toThrow(/append only/);
  });

  it('D6: credit lots change only in remaining_credits and are never deleted', async () => {
    const lot = await one<{ id: string }>(
      "insert into credit_lots (wallet_id, source, original_credits, remaining_credits, origin_ref) values ($1, 'paket', 300, 300, 'd6:lot') returning id",
      [walletId],
    );
    await pg.query('update credit_lots set remaining_credits = 250 where id = $1', [lot.id]);
    // The ledger store upserts lots this way (packages/ledger/src/pg.ts).
    await pg.query(
      `insert into credit_lots (id, wallet_id, source, original_credits, remaining_credits, origin_ref)
       values ($1, $2, 'paket', 300, 200, 'd6:lot') on conflict (id) do update set remaining_credits = excluded.remaining_credits`,
      [lot.id, walletId],
    );
    expect(
      (await one<{ r: number }>('select remaining_credits r from credit_lots where id = $1', [lot.id])).r,
    ).toBe(200);
    await expect(
      pg.query('update credit_lots set original_credits = 1000 where id = $1', [lot.id]),
    ).rejects.toThrow(/only remaining_credits/);
    await expect(pg.query('delete from credit_lots where id = $1', [lot.id])).rejects.toThrow(
      /only remaining_credits/,
    );
    await expect(pg.query('truncate credit_lots cascade')).rejects.toThrow(/only remaining_credits/);
  });

  it('D4: products are unique per code and price table version', async () => {
    expect(await count("select 1 from pg_indexes where indexname = 'products_code_price_table_uq'")).toBe(1);
  });

  it('chunks follow records.masked_text and embed.chunks is enqueued once', async () => {
    const embedJobs = (id: string) =>
      count("select 1 from jobs where type = 'embed.chunks' and dedupe_key = $1 and status = 'queued'", [
        `embed:${id}`,
      ]);
    const rec = await one<{ id: string }>(
      `insert into records (type, title, authority_class, license_basis, source_url, source_key, fetched_at, text, masked_text)
       values ('mevzuat', 'Ornek Kanun', 'baglayici_norm', 'FSEK m.31', 'https://example.invalid/m/1', 'v12:1', now(), 'metin', 'metin')
       returning id`,
    );
    expect(await embedJobs(rec.id)).toBe(1);
    const job = await one<{ payload: unknown }>('select payload from jobs where dedupe_key = $1', [
      `embed:${rec.id}`,
    ]);
    expect(job.payload).toEqual({ recordId: rec.id });

    const addChunk = () =>
      pg.query(
        "insert into chunks (record_id, seq, text, char_start, char_end) values ($1, 0, 'metin', 0, 5)",
        [rec.id],
      );
    await addChunk();
    await pg.query("update records set title = 'Yeni baslik' where id = $1", [rec.id]);
    expect(await count('select 1 from chunks where record_id = $1', [rec.id])).toBe(1);

    await pg.query("update records set masked_text = 'metin v2' where id = $1", [rec.id]);
    expect(await count('select 1 from chunks where record_id = $1', [rec.id])).toBe(0);
    expect(await embedJobs(rec.id)).toBe(1); // still the queued one, not a second

    await pg.query("update jobs set status = 'done' where dedupe_key = $1", [`embed:${rec.id}`]);
    await addChunk();
    await pg.query('update records set masked_text = null where id = $1', [rec.id]);
    expect(await count('select 1 from chunks where record_id = $1', [rec.id])).toBe(0);
    expect(await embedJobs(rec.id)).toBe(0);
  });
});
