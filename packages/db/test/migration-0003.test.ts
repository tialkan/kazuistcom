import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import {
  consentKinds,
  jobTypes,
  kvkkRequestKinds,
  reviewQueueNames,
  takedownKinds,
  takedownTargetTypes,
} from '@kazuist/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationsFolder } from '../src/migrate.ts';

/**
 * Migration 0003 (contract v1.1, ADR-0023). Applied on top of a v1 database that already holds rows, so the
 * upgrade path (backfill, index swap, role seed) is tested, not only a fresh install.
 */
let pg: PGlite;
let v1Folder: string;

const one = async <T>(q: string, params: unknown[] = []) => (await pg.query<T>(q, params)).rows[0] as T;
const enumValues = async (name: string) =>
  (
    await pg.query<{ v: string }>(
      'select e.enumlabel v from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = $1 order by e.enumsortorder',
      [name],
    )
  ).rows.map((r) => r.v);

beforeAll(async () => {
  // A copy of the migrations folder that stops at 0002 (contract v1).
  v1Folder = mkdtempSync(join(tmpdir(), 'kazuist-v1-'));
  cpSync(migrationsFolder, v1Folder, { recursive: true });
  const journalPath = join(v1Folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag < '0003');
  writeFileSync(journalPath, JSON.stringify(journal));

  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder: v1Folder });

  // v1 data: a takedown request for a record, an order with its payment, and an old seed role.
  const u = await one<{ id: string }>("insert into users (email) values ('v1@example.invalid') returning id");
  const rec = await one<{ id: string }>(
    `insert into records (type, title, authority_class, license_basis, source_url, source_key, fetched_at, text)
     values ('karar', 'Ornek', 'emsal', 'FSEK m.31', 'https://example.invalid/k/9', 'v1:9', now(), 'metin') returning id`,
  );
  await pg.query(
    "insert into takedown_requests (record_id, reason, contact_email) values ($1, 'x', 'a@example.invalid')",
    [rec.id],
  );
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
  await pg.query(
    "insert into payments (order_id, provider, provider_payment_id, amount_kurus, status) values ($1, 'iyzico', 'p-1', 100, 'basarili')",
    [ord.id],
  );
  await pg.query("insert into roles (id, description) values ('editor', 'eski'), ('admin', 'eski')");

  await migrate(drizzle(pg), { migrationsFolder });
}, 60_000);

afterAll(async () => {
  await pg.close();
  rmSync(v1Folder, { recursive: true, force: true });
});

describe('migration 0003 on a v1 database', () => {
  it('keeps v1 rows and backfills the takedown target from record_id', async () => {
    const t = await one<{ target_type: string; same: boolean; kind: string; hide: boolean }>(
      `select target_type, target_id = record_id same, kind, hide_due_at > created_at hide from takedown_requests`,
    );
    expect(t).toEqual({ target_type: 'record', same: true, kind: 'kisisel_veri', hide: true });
    const p = await one<{ kind: string; n: number }>(
      'select kind, count(*)::int n from payments group by kind',
    );
    expect(p).toEqual({ kind: 'odeme', n: 1 });
  });

  it('seeds the plan roles and leaves existing role rows untouched', async () => {
    const rows = (
      await pg.query<{ id: string; description: string }>('select id, description from roles order by id')
    ).rows;
    expect(rows.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        'kullanici',
        'ogrenci_dogrulanmis',
        'plus',
        'akademisyen',
        'editor',
        'yonetici',
      ]),
    );
    expect(rows.find((r) => r.id === 'editor')?.description).toBe('eski');
  });

  it('pg enums equal the contract lists', async () => {
    expect(await enumValues('consent_kind')).toEqual([...consentKinds]);
    expect(await enumValues('job_type')).toEqual([...jobTypes]);
    expect(await enumValues('review_queue_name')).toEqual([...reviewQueueNames]);
    expect(await enumValues('kvkk_request_kind')).toEqual([...kvkkRequestKinds]);
    expect(await enumValues('takedown_kind')).toEqual([...takedownKinds]);
    expect(await enumValues('takedown_target_type')).toEqual([...takedownTargetTypes]);
  });

  it('kvkk_requests defaults the thirty day limit and survives account deletion', async () => {
    const u = await one<{ id: string }>(
      "insert into users (email) values ('k@example.invalid') returning id",
    );
    await pg.query(
      "insert into kvkk_requests (user_id, requester_hash, contact_email, kind, detail) values ($1, 'h:k', 'k@example.invalid', 'zarar_giderimi', 'x')",
      [u.id],
    );
    const r = await one<{ days: number; status: string }>(
      "select extract(day from due_at - received_at)::int days, status from kvkk_requests where requester_hash = 'h:k'",
    );
    expect(r).toEqual({ days: 30, status: 'alindi' });
    await pg.query('delete from users where id = $1', [u.id]);
    const after = await one<{ user_id: string | null }>(
      "select user_id from kvkk_requests where requester_hash = 'h:k'",
    );
    expect(after.user_id).toBeNull();
    await pg.query(
      "insert into kvkk_requests (requester_hash, requester_name, contact_email, relation, kind, detail, status) values ('h:g', 'Ornek', 'g@example.invalid', 'karar_metninde_adi_gecen', 'silme', 'x', 'dogrulama_bekliyor')",
    );
  });

  it('takedown targets: records keep the foreign key, Kampus targets have none', async () => {
    const id = '00000000-0000-4000-8000-0000000000aa';
    await pg.query(
      "insert into takedown_requests (kind, target_type, target_id, reason, contact_email) values ('telif', 'kampus_file', $1, 'x', 'a@example.invalid')",
      [id],
    );
    await expect(
      pg.query(
        "insert into takedown_requests (kind, target_type, target_id, reason, contact_email) values ('telif', 'record', $1, 'x', 'a@example.invalid')",
        [id],
      ),
    ).rejects.toThrow(/takedown_requests_record_target/);
    await expect(
      pg.query("update takedown_requests set status = 'kapandi' where target_id = $1", [id]),
    ).rejects.toThrow(/takedown_requests_status/);
  });

  it('payments: one charge per provider id, several refunds, renewals without an order', async () => {
    const ord = await one<{ id: string }>('select id from orders limit 1');
    const dup =
      "insert into payments (order_id, provider, provider_payment_id, amount_kurus, status) values ($1, 'iyzico', 'p-1', 100, 'x')";
    await expect(pg.query(dup, [ord.id])).rejects.toThrow(/duplicate key/);
    const refund =
      "insert into payments (order_id, kind, provider, provider_payment_id, refund_ref, amount_kurus, status) values ($1, 'iade', 'iyzico', 'p-1', $2, 30, 'x')";
    await pg.query(refund, [ord.id, 'r-1']);
    await pg.query(refund, [ord.id, 'r-2']);
    await expect(pg.query(refund, [ord.id, 'r-2'])).rejects.toThrow(/duplicate key/);
    await expect(
      pg.query(
        "insert into payments (provider, provider_payment_id, amount_kurus, status) values ('iyzico', 'p-2', 1, 'x')",
      ),
    ).rejects.toThrow(/payments_owner/);
    await expect(
      pg.query(
        "insert into payments (order_id, kind, provider, provider_payment_id, amount_kurus, status) values ($1, 'iade', 'iyzico', 'p-1', 1, 'x')",
        [ord.id],
      ),
    ).rejects.toThrow(/payments_refund_ref/);
  });

  it('new enum values, review decisions and push channel rules', async () => {
    const u = await one<{ id: string }>(
      "insert into users (email) values ('n@example.invalid') returning id",
    );
    for (const kind of ['abonelik_sozlesmesi', 'yillik_taahhutname', 'yz_ucretsiz_katman'])
      await pg.query(
        "insert into consents (user_id, user_hash, kind, version, granted) values ($1, 'h:n', $2, '2026-10-19.1', true)",
        [u.id, kind],
      );
    await pg.query("insert into jobs (type, payload) values ('account.purge', $1::jsonb)", [
      JSON.stringify({ userId: u.id }),
    ]);
    await pg.query(
      "insert into review_queue (queue, subject_type, decision) values ('kvkk-requests', 'kvkk_request', 'superseded')",
    );
    await expect(
      pg.query(
        "insert into review_queue (queue, subject_type, decision) values ('anonymization', 'record', 'belki')",
      ),
    ).rejects.toThrow(/review_queue_decision/);
    await pg.query(
      "insert into push_subscriptions (user_id, channel, endpoint, environment) values ($1, 'apns', 'tok', 'sandbox'), ($1, 'web_push', 'https://push.example.invalid/1', null)",
      [u.id],
    );
    await expect(
      pg.query("insert into push_subscriptions (user_id, channel, endpoint) values ($1, 'apns', 'tok2')", [
        u.id,
      ]),
    ).rejects.toThrow(/push_subscriptions_channel_env/);
  });

  it('two_factors: one TOTP row per user, removed with the account', async () => {
    const u = await one<{ id: string }>(
      "insert into users (email) values ('t@example.invalid') returning id",
    );
    const ins = "insert into two_factors (user_id, secret, backup_codes) values ($1, 'enc', 'enc')";
    await pg.query(ins, [u.id]);
    await expect(pg.query(ins, [u.id])).rejects.toThrow(/duplicate key/);
    await pg.query('delete from users where id = $1', [u.id]);
    expect((await one<{ n: number }>('select count(*)::int n from two_factors')).n).toBe(0);
  });

  it('coupon redemptions are unique per user and coupon', async () => {
    const u = await one<{ id: string }>(
      "insert into users (email) values ('c3@example.invalid') returning id",
    );
    const c = await one<{ id: string }>(
      "insert into coupons (code, credits) values ('ASBU', 50) returning id",
    );
    const tx = await one<{ id: string }>(
      "insert into ledger_transactions (kind, idempotency_key) values ('kupon', 'kupon:1') returning id",
    );
    const ins =
      'insert into coupon_redemptions (coupon_id, user_id, ledger_transaction_id) values ($1, $2, $3)';
    await pg.query(ins, [c.id, u.id, tx.id]);
    await expect(pg.query(ins, [c.id, u.id, tx.id])).rejects.toThrow(/duplicate key/);
  });
});
