import { AccountPurgePayload } from '@kazuist/contracts';
import type { ClaimedJob } from '@kazuist/db/jobs';
import { createHmac } from 'node:crypto';
import type { SqlClient } from '../queue.ts';

/**
 * account.purge (ADR-0023). Runs after the grace period that DELETE /v1/me set as run_after (default 14
 * days, at most 30; the exact value is Tarik's decision, ACCOUNT_PURGE_GRACE_DAYS on the web side).
 *
 * Idempotent and atomic: every step runs in one transaction on one connection, so a failure leaves the account
 * exactly as it was and the job retries. Steps:
 * 1. Lock the users row. Skip when it no longer exists (already purged), was restored (deleted_at null) or is
 *    already the anonymous tombstone of an earlier run.
 * 2. Delete every personal row that references the user (purgeSteps below, enumerated from packages/db schema:
 *    auth, profile, library, practice, writing, Kampus, notification and queue tables). Shared content the user
 *    approved as staff keeps the row with the user column cleared.
 * 3. Consents and audit_log keep only the keyed hash (the append only triggers allow exactly the user column to
 *    become NULL). KVKK applications of the account keep kind, status, dates and the hash; every personal field
 *    is cleared.
 * 4. Billing and ledger rows the law requires to keep (VUK, 6502 and Mesafeli Sozlesmeler Yonetmeligi: wallets,
 *    credit lots, ledger, orders, payments, subscriptions, invoices, refunds, IAP, frozen contract documents) are
 *    not touched. An empty wallet is deleted. The users row is then deleted; when a kept row still references it
 *    (foreign key 23503) it stays as an anonymous tombstone instead: e-mail replaced, name, image, verification
 *    and second factor cleared. No other personal row remains in either case.
 */
export interface PurgeDeps {
  /** pg.Pool (a client is checked out for the transaction), pg.Client or PGlite (single connection). */
  db: SqlClient;
  /** Same secret as the web side (BETTER_AUTH_SECRET) so the audit hash matches. */
  secret: string;
  now?: () => Date;
}

export interface PurgeResult {
  status: 'purged' | 'anonymised' | 'skipped';
  reason?: string;
}

/** Placeholder e-mail of an anonymised account; also the marker that a purge already ran. */
export const tombstoneEmail = (userId: string) => `silindi-${userId}@kazuist.invalid`;

type Arg = 'id' | 'email' | 'tomb';
interface PurgeStep {
  table: string;
  sql: string;
  /** Bound parameters in order ($1, $2, ...); default the user id only. */
  args?: readonly Arg[];
}

/**
 * Statements of step 2 and 3, in foreign key order. Exported so the integration test can check that every
 * table referencing users is covered.
 */
export const purgeSteps: readonly PurgeStep[] = [
  // Queue rows that name the user (payloads carry ids only, but the id links the person). The running purge
  // job itself and jobs owned by a live worker are left alone.
  {
    table: 'jobs',
    sql: `delete from jobs where type in ('notify.send', 'rules.extract') and payload ->> 'userId' = $1::text
          and status <> 'running'`,
  },
  { table: 'notices', sql: 'delete from notices where user_id = $1' },
  { table: 'idempotency_keys', sql: 'delete from idempotency_keys where user_id = $1' },
  // Writing: reminders and logs go with the projects; the user's own unapproved guide rules are deleted,
  // approved (shared) rules lose the user link.
  { table: 'reminders', sql: 'delete from reminders where user_id = $1' },
  { table: 'writing_projects', sql: 'delete from writing_projects where user_id = $1' },
  {
    table: 'template_rules',
    sql: `delete from template_rules t where t.user_id = $1 and not t.approved
          and not exists (select 1 from writing_projects w where w.template_rule_id = t.id)`,
  },
  { table: 'template_rules', sql: 'update template_rules set user_id = null where user_id = $1' },
  { table: 'library_items', sql: 'delete from library_items where user_id = $1' },
  { table: 'guide_progress', sql: 'delete from guide_progress where user_id = $1' },
  { table: 'card_reviews', sql: 'delete from card_reviews where user_id = $1' },
  { table: 'exam_attempts', sql: 'delete from exam_attempts where user_id = $1' },
  // Kampus (passive, ADR-0031; the tables exist): the profile cascades to files, posts, follows, summaries,
  // posters and full text requests.
  { table: 'kampus.reports', sql: 'delete from kampus.reports where reporter_id = $1' },
  { table: 'kampus.profiles', sql: 'delete from kampus.profiles where user_id = $1' },
  // Auth and account tables.
  { table: 'sessions', sql: 'delete from sessions where user_id = $1' },
  { table: 'accounts', sql: 'delete from accounts where user_id = $1' },
  { table: 'passkeys', sql: 'delete from passkeys where user_id = $1' },
  { table: 'two_factors', sql: 'delete from two_factors where user_id = $1' },
  { table: 'edu_verifications', sql: 'delete from edu_verifications where user_id = $1' },
  { table: 'user_roles', sql: 'delete from user_roles where user_id = $1' },
  { table: 'notification_prefs', sql: 'delete from notification_prefs where user_id = $1' },
  { table: 'push_subscriptions', sql: 'delete from push_subscriptions where user_id = $1' },
  { table: 'profiles', sql: 'delete from profiles where user_id = $1' },
  // Better Auth codes: identifiers embed the e-mail (email-verification-otp-<email>), some values the id.
  {
    table: 'verifications',
    sql: `delete from verifications where value = $1::text or position($1::text in value) > 0
          or position(lower($2::text) in lower(identifier)) > 0`,
    args: ['id', 'email'],
  },
  // Proof of consent and the audit trail stay by hash only (triggers allow only this change).
  { table: 'consents', sql: 'update consents set user_id = null where user_id = $1' },
  { table: 'audit_log', sql: 'update audit_log set actor_id = null where actor_id = $1' },
  // KVKK m.11 applications: keep kind, status, dates, requester hash and the answer summary.
  {
    table: 'kvkk_requests',
    sql: `update kvkk_requests set user_id = null, requester_name = null, nationality = null,
          identity_enc = null, address = null, phone = null, contact_email = $2, detail = '[silindi]',
          updated_at = now() where user_id = $1`,
    args: ['id', 'tomb'],
  },
  // Staff references on shared content: the content stays, the person link goes.
  { table: 'kvkk_requests', sql: 'update kvkk_requests set decided_by = null where decided_by = $1' },
  { table: 'user_roles', sql: 'update user_roles set granted_by = null where granted_by = $1' },
  { table: 'takedown_requests', sql: 'update takedown_requests set decided_by = null where decided_by = $1' },
  { table: 'review_queue', sql: 'update review_queue set decided_by = null where decided_by = $1' },
  {
    table: 'anonymization_spans',
    sql: 'update anonymization_spans set reviewed_by = null where reviewed_by = $1',
  },
  { table: 'norm_mappings', sql: 'update norm_mappings set approved_by = null where approved_by = $1' },
  {
    table: 'journal_rule_versions',
    sql: 'update journal_rule_versions set approved_by = null where approved_by = $1',
  },
  { table: 'card_versions', sql: 'update card_versions set approved_by = null where approved_by = $1' },
  { table: 'decks', sql: 'update decks set owner_id = null where owner_id = $1' },
  { table: 'price_tables', sql: 'update price_tables set created_by = null where created_by = $1' },
];

/**
 * Tables whose rows are kept for legal retention and may keep referencing the anonymised users row. Their user
 * columns are listed so the integration test can prove nothing else references a purged user.
 */
export const retainedReferences: readonly string[] = [
  'wallets.user_id',
  'orders.user_id',
  'subscriptions.user_id',
  'coupon_redemptions.user_id',
  'invoices.user_id',
  'refund_requests.user_id',
  'refund_requests.decided_by',
  'refund_request_items.resolved_by',
  'refund_request_items.updated_by',
  'iap_transactions.user_id',
  'order_legal_documents.user_id',
  'order_legal_document_deliveries.user_id',
];

const hash = (secret: string, id: string) =>
  createHmac('sha256', secret).update(`subject:${id}`).digest('hex');

type TxClient = SqlClient & { release?: () => void };

/** One connection for the whole transaction: a pg.Pool hands out a client, other clients are one connection. */
async function inTransaction<T>(db: SqlClient, fn: (tx: SqlClient) => Promise<T>): Promise<T> {
  const pool = db as SqlClient & { connect?: () => Promise<TxClient> };
  const tx: TxClient = typeof pool.connect === 'function' ? await pool.connect() : db;
  try {
    await tx.query('begin');
    try {
      const out = await fn(tx);
      await tx.query('commit');
      return out;
    } catch (err) {
      await tx.query('rollback');
      throw err;
    }
  } finally {
    tx.release?.();
  }
}

/** Runs statements under a savepoint; returns false (and undoes them) on a foreign key violation. */
async function tryUnderSavepoint(tx: SqlClient, sqls: string[], params: unknown[]): Promise<boolean> {
  await tx.query('savepoint purge_try');
  try {
    for (const sql of sqls) await tx.query(sql, params);
    await tx.query('release savepoint purge_try');
    return true;
  } catch (err) {
    await tx.query('rollback to savepoint purge_try');
    if ((err as { code?: string }).code !== '23503') throw err;
    return false;
  }
}

export async function purgeAccount(deps: PurgeDeps, raw: unknown): Promise<PurgeResult> {
  const { userId } = AccountPurgePayload.parse(raw);
  return inTransaction(deps.db, async (tx) => {
    const { rows } = await tx.query<{ deleted_at: Date | null; email: string }>(
      'select deleted_at, email from users where id = $1 for update',
      [userId],
    );
    const u = rows[0];
    if (!u) return { status: 'skipped', reason: 'not_found' };
    if (!u.deleted_at) return { status: 'skipped', reason: 'not_deleted' };
    const tomb = tombstoneEmail(userId);
    if (u.email === tomb) return { status: 'skipped', reason: 'already_anonymised' };

    const value: Record<Arg, string> = { id: userId, email: u.email, tomb };
    for (const step of purgeSteps)
      await tx.query(
        step.sql,
        (step.args ?? ['id']).map((a) => value[a]),
      );

    // A wallet without any ledger history is not a retained record (the ledger tables reject deletes, so a
    // wallet with lots, transactions or reservations fails the foreign key and stays).
    await tryUnderSavepoint(
      tx,
      [
        `delete from ledger_accounts a using wallets w where a.wallet_id = w.id and w.user_id = $1
         and not exists (select 1 from ledger_entries e where e.account_id = a.id)`,
        'delete from wallets where user_id = $1',
      ],
      [userId],
    );

    const deleted = await tryUnderSavepoint(tx, ['delete from users where id = $1'], [userId]);
    const status: PurgeResult['status'] = deleted ? 'purged' : 'anonymised';
    if (!deleted) {
      await tx.query(
        `update users set email = $2, name = null, image = null, email_verified = false,
         two_factor_enabled = false, updated_at = now() where id = $1`,
        [userId, tomb],
      );
    }
    await tx.query(
      `insert into audit_log (actor_id, actor_hash, action, subject_type, subject_id, diff)
       values (null, $1, 'user.purged', 'user', null, $2::jsonb)`,
      [hash(deps.secret, userId), JSON.stringify({ result: status })],
    );
    return { status };
  });
}

/** JobHandler for the consumer: `{ 'account.purge': createPurgeHandler(deps) }` (registered in handlers.ts). */
export function createPurgeHandler(deps: PurgeDeps) {
  return (job: ClaimedJob) => purgeAccount(deps, job.payload);
}
