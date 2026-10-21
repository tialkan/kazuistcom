import { AccountPurgePayload } from '@kazuist/contracts';
import type { ClaimedJob } from '@kazuist/db/jobs';
import { createHmac } from 'node:crypto';
import type { SqlClient } from '../queue.ts';

/**
 * account.purge (ADR-0023). Runs after the grace period that DELETE /v1/me set as run_after (default 14
 * days, at most 30; the exact value is Tarik's decision, ACCOUNT_PURGE_GRACE_DAYS on the web side).
 *
 * Idempotent. Steps:
 * 1. Skip when the user no longer exists (already purged) or was restored (deleted_at null).
 * 2. Delete personal tables owned by kimlik explicitly (sessions, accounts, passkeys, two factor,
 *    verification codes, profile, roles, edu, notification prefs and push subscriptions).
 * 3. Delete the users row; consents, audit_log and kvkk_requests keep only the hash (ON DELETE SET NULL).
 * 4. When a row that the law requires to keep still references the user (billing records, foreign key
 *    23503), the users row is anonymised in place instead: e-mail replaced, name and image cleared.
 */
export interface PurgeDeps {
  db: SqlClient;
  /** Same secret as the web side (BETTER_AUTH_SECRET) so the audit hash matches. */
  secret: string;
  now?: () => Date;
}

export interface PurgeResult {
  status: 'purged' | 'anonymised' | 'skipped';
  reason?: string;
}

const personalTables = [
  'sessions',
  'accounts',
  'passkeys',
  'two_factors',
  'user_roles',
  'edu_verifications',
  'notification_prefs',
  'push_subscriptions',
  'profiles',
] as const;

const hash = (secret: string, id: string) =>
  createHmac('sha256', secret).update(`subject:${id}`).digest('hex');

export async function purgeAccount(deps: PurgeDeps, raw: unknown): Promise<PurgeResult> {
  const { userId } = AccountPurgePayload.parse(raw);
  const { rows } = await deps.db.query<{ deleted_at: Date | null }>(
    'select deleted_at from users where id = $1',
    [userId],
  );
  const u = rows[0];
  if (!u) return { status: 'skipped', reason: 'not_found' };
  if (!u.deleted_at) return { status: 'skipped', reason: 'not_deleted' };

  for (const t of personalTables) await deps.db.query(`delete from ${t} where user_id = $1`, [userId]);
  await deps.db.query(`delete from verifications where value = $1`, [userId]);

  let status: PurgeResult['status'] = 'purged';
  try {
    await deps.db.query('delete from users where id = $1', [userId]);
  } catch (err) {
    if ((err as { code?: string }).code !== '23503') throw err;
    status = 'anonymised';
    await deps.db.query(
      `update users set email = $2, name = null, image = null, email_verified = false, updated_at = now() where id = $1`,
      [userId, `silindi-${userId}@kazuist.invalid`],
    );
  }
  await deps.db.query(
    `insert into audit_log (actor_id, actor_hash, action, subject_type, subject_id, diff)
     values (null, $1, 'user.purged', 'user', null, $2::jsonb)`,
    [hash(deps.secret, userId), JSON.stringify({ result: status })],
  );
  return { status };
}

/** JobHandler for the consumer: `{ 'account.purge': createPurgeHandler(deps) }` (registered in handlers.ts). */
export function createPurgeHandler(deps: PurgeDeps) {
  return (job: ClaimedJob) => purgeAccount(deps, job.payload);
}
