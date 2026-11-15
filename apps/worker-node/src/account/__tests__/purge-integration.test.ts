import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { randomUUID } from 'node:crypto';
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import { migrate as migrateNode } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SqlClient } from '../../queue.ts';
import { purgeAccount, purgeSteps, retainedReferences, tombstoneEmail } from '../purge.ts';

/**
 * account.purge against a real PostgreSQL engine with every migration applied. Always runs on PGlite (PostgreSQL
 * compiled to WASM, same SQL, triggers and foreign keys); with KAZUIST_IT_DATABASE_URL set it runs the same
 * cases on that server too, through pg.Pool, so the checked out client transaction path is exercised. The
 * server database must be disposable: migrations are applied to it.
 *
 * Proof of "no personal row remains": the seeded user owns rows in every table that references users (the
 * test fails when a new users foreign key appears that purge.ts does not handle), every personal value carries
 * a unique marker, and after the purge the marker is searched in the text form of every row of every table.
 */

interface Backend {
  name: string;
  open(): Promise<{ db: SqlClient; close(): Promise<void> }>;
}

const backends: Backend[] = [
  {
    name: 'pglite',
    async open() {
      const p = await PGlite.create({ extensions: { vector, pg_trgm } });
      await migrate(drizzle(p), { migrationsFolder });
      return { db: p, close: () => p.close() };
    },
  },
];
const serverUrl = process.env.KAZUIST_IT_DATABASE_URL;
if (serverUrl) {
  backends.push({
    name: 'postgres',
    async open() {
      const pool = new pg.Pool({ connectionString: serverUrl, max: 4 });
      await migrateNode(drizzleNode(pool), { migrationsFolder });
      return { db: pool, close: () => pool.end() };
    },
  });
}

/** Personal values in the legally retained contract snapshot (frozen order documents) are allowed to stay. */
const legallyRetainedText = new Set(['order_legal_documents']);

describe.each(backends)('account.purge on $name', (backend) => {
  let db: SqlClient;
  let close: () => Promise<void>;
  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) =>
    (await db.query<T>(sql, p)).rows;
  const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) =>
    (await q<T>(sql, p))[0] as T;
  const deps = () => ({ db, secret: 'test-secret' });

  beforeAll(async () => {
    ({ db, close } = await backend.open());
  }, 120_000);
  afterAll(async () => {
    await close();
  });

  async function record(): Promise<string> {
    const r = await one<{ id: string }>(
      `insert into records (type, title, authority_class, license_basis, source_url, source_key, fetched_at, text)
       values ('karar', 'Karar', 'emsal', 'kamu', 'https://example.invalid/k', $1, now(), 'metin') returning id`,
      [`k-${randomUUID()}`],
    );
    return r.id;
  }

  /** A deleted user with a personal row in every user table; returns the id and the marker. */
  async function seedUser(opts: { billing: boolean; staff?: boolean }) {
    const mark = `kisisel-iz-${randomUUID().slice(0, 8)}`;
    // Identifiers that are not personal data (slugs, invoice numbers, provider references).
    const tag = randomUUID().slice(0, 12);
    const email = `${mark}@example.invalid`;
    const { id } = await one<{ id: string }>(
      `insert into users (email, name, image, email_verified, deleted_at)
       values ($1, $2, $3, true, now()) returning id`,
      [email, `Ad ${mark}`, `https://example.invalid/${mark}.png`],
    );
    const other = await one<{ id: string }>(`insert into users (email) values ($1) returning id`, [
      `baska-${randomUUID()}@example.invalid`,
    ]);
    const rec = await record();
    const run = (sql: string, p: unknown[] = []) => q(sql, p);

    // Auth and account.
    await run(
      `insert into profiles (user_id, target_profession, avatar, tone) values ($1, 'avukat', $2, 'nazik')`,
      [id, mark],
    );
    await run(
      `insert into sessions (user_id, token, expires_at, ip_address, user_agent)
       values ($1, $2, now() + interval '1 day', '10.0.0.1', $3)`,
      [id, `t-${mark}`, mark],
    );
    await run(
      `insert into accounts (user_id, account_id, provider_id, password) values ($1, $2, 'credential', 'h')`,
      [id, mark],
    );
    await run(`insert into passkeys (user_id, name, public_key, credential_id) values ($1, $2, 'pk', $3)`, [
      id,
      mark,
      `cred-${mark}`,
    ]);
    await run(`insert into two_factors (user_id, secret, backup_codes) values ($1, 's', 'b')`, [id]);
    await run(
      `insert into edu_verifications (user_id, email, code_hash, expires_at, verified_at)
       values ($1, $2, 'h', now(), now())`,
      [id, `${mark}@ogr.example.edu.tr`],
    );
    await run(`insert into user_roles (user_id, role_id) values ($1, 'kullanici')`, [id]);
    await run(`insert into user_roles (user_id, role_id, granted_by) values ($1, 'kullanici', $2)`, [
      other.id,
      id,
    ]);
    await run(`insert into verifications (identifier, value, expires_at) values ($1, '123456', now())`, [
      `email-verification-otp-${email}`,
    ]);
    await run(`insert into verifications (identifier, value, expires_at) values ('edu', $1, now())`, [id]);
    await run(`insert into notification_prefs (user_id) values ($1)`, [id]);
    await run(`insert into push_subscriptions (user_id, channel, endpoint) values ($1, 'web_push', $2)`, [
      id,
      `https://push.example.invalid/${mark}`,
    ]);
    await run(
      `insert into consents (user_id, user_hash, kind, version, granted) values ($1, 'h', 'aydinlatma', 'v1', true)`,
      [id],
    );
    await run(
      `insert into audit_log (actor_id, actor_hash, action, subject_type) values ($1, 'h', 'x', 'user')`,
      [id],
    );
    await run(
      `insert into kvkk_requests (user_id, requester_hash, requester_name, nationality, identity_enc, address,
         contact_email, phone, kind, detail)
       values ($1, 'h', $2, 'TR', $2, $2, $3, $2, 'bilgi', $2)`,
      [id, mark, email],
    );
    // Content.
    await run(`insert into library_items (user_id, record_id, note) values ($1, $2, $3)`, [id, rec, mark]);
    await run(`insert into guide_progress (user_id, guide_id) values ($1, $2)`, [id, mark]);
    const deck = await one<{ id: string }>(
      `insert into decks (slug, title, owner_id) values ($1, 'Deste', $2) returning id`,
      [`d-${tag}`, id],
    );
    const card = await one<{ id: string }>(
      `insert into cards (deck_id, kind) values ($1, 'klasik') returning id`,
      [deck.id],
    );
    await run(
      `insert into card_reviews (user_id, card_id, due, stability, difficulty) values ($1, $2, now(), 1, 1)`,
      [id, card.id],
    );
    const exam = await one<{ id: string }>(
      `insert into exams (title, card_ids, duration_minutes) values ('Sinav', '[]', 10) returning id`,
    );
    await run(`insert into exam_attempts (exam_id, user_id, answers, score) values ($1, $2, $3, 1)`, [
      exam.id,
      id,
      JSON.stringify({ not: mark }),
    ]);
    const rule = await one<{ id: string }>(
      `insert into template_rules (user_id, rules, source_object_key) values ($1, '{}', $2) returning id`,
      [id, mark],
    );
    await run(
      `insert into template_rule_evidence (template_rule_id, rule_key, excerpt) values ($1, 'k', $2)`,
      [rule.id, mark],
    );
    const shared = await one<{ id: string }>(
      `insert into template_rules (user_id, rules, approved) values ($1, '{}', true) returning id`,
      [id],
    );
    const project = await one<{ id: string }>(
      `insert into writing_projects (user_id, title, kind, template_rule_id) values ($1, $2, 'tez', $3) returning id`,
      [id, mark, rule.id],
    );
    await run(
      `insert into writing_logs (project_id, words, note, logged_on) values ($1, 10, $2, current_date)`,
      [project.id, mark],
    );
    await run(`insert into reminders (user_id, project_id, kind) values ($1, $2, 'teslim')`, [
      id,
      project.id,
    ]);
    await run(`insert into reminders (user_id, kind) values ($1, 'kalemcik')`, [id]);
    // Kampus (passive module, tables exist).
    const kp = await one<{ id: string }>(
      `insert into kampus.profiles (user_id, display_name, bio) values ($1, $2, $2) returning id`,
      [id, mark],
    );
    const kf = await one<{ id: string }>(
      `insert into kampus.files (owner_id, object_key, content_type, size_bytes, sha256)
       values ($1, $2, 'application/pdf', 1, 'x') returning id`,
      [kp.id, mark],
    );
    await run(`insert into kampus.posts (profile_id, kind, title, file_id) values ($1, 'not', $2, $3)`, [
      kp.id,
      mark,
      kf.id,
    ]);
    await run(
      `insert into kampus.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, $3)`,
      [id, randomUUID(), mark],
    );
    // Queue and notices.
    await run(`insert into jobs (type, payload) values ('notify.send', $1)`, [
      JSON.stringify({ type: 'kalemcik', userId: id }),
    ]);
    await run(`insert into notices (user_id, kind, ref, send_at) values ($1, 'odeme_7_gun', $2, now())`, [
      id,
      mark,
    ]);
    await run(
      `insert into idempotency_keys (user_id, operation, key, request_hash, expires_at, response_body)
       values ($1, 'x', $2, 'h', now(), $3)`,
      [id, mark, JSON.stringify({ e: email })],
    );
    if (opts.staff) {
      await run(`insert into review_queue (queue, subject_type, decided_by) values ('cards', 'x', $1)`, [id]);
      await run(
        `insert into takedown_requests (kind, target_type, target_id, reason, contact_email, decided_by)
         values ('telif', 'kampus_post', $1, 'r', 'baska@example.invalid', $2)`,
        [randomUUID(), id],
      );
      await run(
        `insert into anonymization_spans (record_id, policy_version, entity, mask, char_start, char_end, detector, reviewed_by)
         values ($1, 'p1', 'ad', '[AD]', 0, 1, 'kural', $2)`,
        [rec, id],
      );
      await run(`insert into card_versions (card_id, version, front, approved_by) values ($1, 1, 'on', $2)`, [
        card.id,
        id,
      ]);
      await run(
        `insert into price_tables (version, effective_from, operations, created_by) values ($1, now(), '{}', $2)`,
        [`staff-${tag}`, id],
      );
      const journal = await one<{ id: string }>(`insert into journals (name) values ('Dergi') returning id`);
      await run(
        `insert into journal_rule_versions (journal_id, version, rules, approved_by) values ($1, 1, '{}', $2)`,
        [journal.id, id],
      );
      await run(
        `insert into kvkk_requests (requester_hash, contact_email, kind, detail, decided_by)
         values ('h2', 'baska@example.invalid', 'bilgi', 'd', $1)`,
        [id],
      );
    }
    if (opts.billing) {
      const wallet = await one<{ id: string }>(`insert into wallets (user_id) values ($1) returning id`, [
        id,
      ]);
      await run(
        `insert into credit_lots (wallet_id, source, original_credits, remaining_credits, expires_at, origin_ref)
         values ($1, 'promosyon', 50, 50, now() + interval '30 days', $2)`,
        [wallet.id, `kayit:${id}`],
      );
      const tx = await one<{ id: string }>(
        `insert into ledger_transactions (kind, idempotency_key, wallet_id) values ('promosyon', $1, $2) returning id`,
        [`kayit:${id}`, wallet.id],
      );
      const pt = await one<{ id: string }>(
        `insert into price_tables (version, effective_from, operations) values ($1, now(), '{}') returning id`,
        [`v-${tag}`],
      );
      const product = await one<{ id: string }>(
        `insert into products (code, kind, price_table_id, price_kurus, credits) values ('paket_s', 'paket', $1, 9900, 100)
         returning id`,
        [pt.id],
      );
      const order = await one<{ id: string }>(
        `insert into orders (user_id, product_id, amount_kurus, status, idempotency_key, consent_versions)
         values ($1, $2, 9900, 'odendi', $3, '{"preInfo":"v1","distance":"v1"}') returning id`,
        [id, product.id, tag],
      );
      await run(
        `insert into payments (order_id, provider, provider_payment_id, amount_kurus, status)
         values ($1, 'iyzico', $2, 9900, 'basarili')`,
        [order.id, `p-${tag}`],
      );
      await run(
        `insert into invoices (order_id, user_id, number, total_kurus, issued_at) values ($1, $2, $3, 9900, now())`,
        [order.id, id, `F-${tag}`],
      );
      await run(
        `insert into order_legal_documents (order_id, user_id, slug, version, filled_text, sha256, fields)
         select $1, $2, 'on-bilgilendirme', 'v1', t, encode(sha256(convert_to(t, 'UTF8')), 'hex'), $4::jsonb
         from (select $3::text as t) s`,
        [order.id, id, `Alici: ${email}`, JSON.stringify({ ALICI_EPOSTA: email })],
      );
      await run(
        `insert into subscriptions (user_id, product_id, channel, provider_ref, status) values ($1, $2, 'iyzico', $3, 'iptal')`,
        [id, product.id, `s-${tag}`],
      );
      const coupon = await one<{ id: string }>(
        `insert into coupons (code, credits) values ($1, 10) returning id`,
        [`c-${tag}`],
      );
      await run(
        `insert into coupon_redemptions (coupon_id, user_id, ledger_transaction_id) values ($1, $2, $3)`,
        [coupon.id, id, tx.id],
      );
      await run(
        `insert into iap_transactions (user_id, transaction_id, original_transaction_id, product_id, environment)
         values ($1, $2, $2, 'p', 'sandbox')`,
        [id, `iap-${tag}`],
      );
      await run(`insert into refund_requests (user_id, order_id, reason) values ($1, $2, 'hesap_silme:x')`, [
        id,
        order.id,
      ]);
    }
    return { id, mark, email, other: other.id, sharedRule: shared.id };
  }

  /** Every foreign key column that references users.id, as table.column (kampus tables schema qualified). */
  async function userForeignKeys(): Promise<string[]> {
    const rows = await q<{ ref: string }>(
      `select c.conrelid::regclass::text || '.' || a.attname as ref
       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid = 'public.users'::regclass order by 1`,
    );
    return rows.map((r) => r.ref);
  }

  /** Tables (schema.table) whose rows contain the marker anywhere in their text form. */
  async function tablesContaining(mark: string): Promise<string[]> {
    const tables = await q<{ t: string }>(
      `select quote_ident(schemaname) || '.' || quote_ident(tablename) as t from pg_tables
       where schemaname in ('public', 'kampus') order by 1`,
    );
    const hits: string[] = [];
    for (const { t } of tables) {
      const r = await one<{ n: number }>(`select count(*)::int as n from ${t} x where x::text like $1`, [
        `%${mark}%`,
      ]);
      if (r.n > 0) hits.push(t.replace(/^public\./, ''));
    }
    return hits;
  }

  it('every users foreign key is either purged or a documented legal retention', async () => {
    const handled = new Set(purgeSteps.map((s) => s.table));
    const unhandled = (await userForeignKeys()).filter((ref) => {
      const table = ref.slice(0, ref.lastIndexOf('.'));
      return !handled.has(table) && !retainedReferences.includes(ref);
    });
    expect(unhandled).toEqual([]);
  });

  it('without billing records: the users row and every personal row are gone', async () => {
    const u = await seedUser({ billing: false });
    expect(await tablesContaining(u.mark)).not.toEqual([]);
    const consentsBefore = await one<{ n: number }>('select count(*)::int as n from consents');
    expect(await purgeAccount(deps(), { userId: u.id })).toEqual({ status: 'purged' });

    expect(await q('select 1 from users where id = $1', [u.id])).toHaveLength(0);
    expect(await tablesContaining(u.mark)).toEqual([]);
    for (const ref of await userForeignKeys()) {
      const dot = ref.lastIndexOf('.');
      const r = await one<{ n: number }>(
        `select count(*)::int as n from ${ref.slice(0, dot)} where ${ref.slice(dot + 1)} = $1`,
        [u.id],
      );
      expect({ ref, n: r.n }).toEqual({ ref, n: 0 });
    }
    // Proof of consent and the KVKK application stay, by hash only.
    expect(await one('select count(*)::int as n from consents')).toEqual(consentsBefore);
    const k = await one<{ contact_email: string; detail: string; kind: string }>(
      `select contact_email, detail, kind from kvkk_requests where contact_email = $1`,
      [tombstoneEmail(u.id)],
    );
    expect(k).toEqual({ contact_email: tombstoneEmail(u.id), detail: '[silindi]', kind: 'bilgi' });
    // Approved shared guide rules stay without the person link; the other user's role row stays.
    expect(await one(`select user_id from template_rules where id = $1`, [u.sharedRule])).toEqual({
      user_id: null,
    });
    expect(
      await q(`select 1 from user_roles where user_id = $1 and granted_by is null`, [u.other]),
    ).toHaveLength(1);
  });

  it('with billing records: only legal retention references remain, on an anonymous tombstone', async () => {
    const u = await seedUser({ billing: true, staff: true });
    expect(await purgeAccount(deps(), { userId: u.id })).toEqual({ status: 'anonymised' });

    const t = await one<Record<string, unknown>>(
      `select email, name, image, email_verified, two_factor_enabled from users where id = $1`,
      [u.id],
    );
    expect(t).toEqual({
      email: tombstoneEmail(u.id),
      name: null,
      image: null,
      email_verified: false,
      two_factor_enabled: false,
    });
    // The marker survives only in the frozen contract snapshot the law requires to keep.
    expect((await tablesContaining(u.mark)).filter((x) => !legallyRetainedText.has(x))).toEqual([]);
    const remaining: string[] = [];
    for (const ref of await userForeignKeys()) {
      const dot = ref.lastIndexOf('.');
      const r = await one<{ n: number }>(
        `select count(*)::int as n from ${ref.slice(0, dot)} where ${ref.slice(dot + 1)} = $1`,
        [u.id],
      );
      if (r.n > 0) remaining.push(ref);
    }
    expect(remaining.every((ref) => retainedReferences.includes(ref))).toBe(true);
    expect(remaining).toEqual(
      expect.arrayContaining(['wallets.user_id', 'orders.user_id', 'invoices.user_id']),
    );
    // Ledger rows are untouched.
    expect(
      await one(
        `select count(*)::int as n from credit_lots l join wallets w on w.id = l.wallet_id where w.user_id = $1`,
        [u.id],
      ),
    ).toEqual({ n: 1 });
    // A second run is a no-op (no second audit row).
    expect(await purgeAccount(deps(), { userId: u.id })).toEqual({
      status: 'skipped',
      reason: 'already_anonymised',
    });
  });

  it('is atomic: a failure part way leaves every row in place', async () => {
    const u = await seedUser({ billing: false });
    // One connection for the wrapped client: a pg.Pool hands one out, PGlite is one already.
    const pool = db as SqlClient & { connect?: () => Promise<pg.PoolClient> };
    const conn = pool.connect ? await pool.connect() : null;
    const inner: SqlClient = conn ?? db;
    let calls = 0;
    const failing: SqlClient = {
      query: async <R>(sql: string, p?: unknown[]) => {
        // begin, select, then a few purge statements succeed before the failure.
        if (++calls === 12) throw Object.assign(new Error('boom'), { code: 'XX000' });
        return inner.query<R>(sql, p);
      },
    };
    try {
      await expect(purgeAccount({ db: failing, secret: 's' }, { userId: u.id })).rejects.toThrow('boom');
    } finally {
      conn?.release();
    }
    expect(await q('select 1 from users where id = $1 and email = $2', [u.id, u.email])).toHaveLength(1);
    expect(await q('select 1 from sessions where user_id = $1', [u.id])).toHaveLength(1);
    expect(await q('select 1 from library_items where user_id = $1', [u.id])).toHaveLength(1);
    expect(await q('select 1 from writing_projects where user_id = $1', [u.id])).toHaveLength(1);
    // The retry completes.
    expect((await purgeAccount(deps(), { userId: u.id })).status).toBe('purged');
  });
});
