import {
  parseJobPayload,
  type JobPayloadInput,
  type JobType,
  type JobTypeWithPayload,
} from '@kazuist/contracts';

/**
 * Job queue contract shared by apps/worker-node and services/worker-py (plan Ek C.3, ADR-0023, ADR-0035).
 * - Producers INSERT into jobs (enqueueJob validates the payload first); a trigger sends NOTIFY on channel
 *   jobsChannel(type). Daily and scheduled producers use enqueueOnceSql, so a key that already ran is not queued
 *   again after a restart.
 * - Consumers LISTEN on their channels, and also poll, then claim with claimJobsSql.
 * - A consumer validates the claimed payload with contracts parseJobPayload and buries an invalid job at once
 *   (buryJobSql, error `invalid payload`; the payload is never logged).
 * - While a handler runs, the consumer renews the lock with heartbeatJobSql every JOB_HEARTBEAT_SECONDS.
 * - complete, fail, bury and heartbeat match the worker id as well: a worker whose lock was released as stale and
 *   taken by another worker gets no row back, logs "lock lost" and neither finishes nor retries the job.
 * - releaseStaleJobsSql returns jobs of crashed workers to the queue, or buries them when the attempts are used up.
 * - pruneJobsSql deletes finished rows after JOB_RETENTION_DAYS (worker-node maintenance, once a day).
 * - Every job is idempotent; payload carries ids, never personal data.
 * services/worker-py/core/jobs.py holds the same statements with psycopg placeholders; its tests compare them.
 */
export function jobsChannel(type: JobType): string {
  return `jobs_${type.replace(/\./g, '_')}`;
}

/** A running job whose lock is older than this many seconds counts as abandoned (both workers' default). */
export const JOB_STALE_SECONDS = 900;
/** Lock renewal interval while a handler runs: a third of the stale limit, so one missed beat keeps the lock. */
export const JOB_HEARTBEAT_SECONDS = JOB_STALE_SECONDS / 3;
/**
 * Retention of finished rows in days (ADR-0035): done 14, failed and dead 90 (kept longer for diagnosis). Both
 * are longer than any dedupe window (one day), so enqueueOnceSql still sees a key that already ran.
 */
export const JOB_RETENTION_DAYS = { done: 14, dead: 90 } as const;
/** Rows deleted per pruneJobsSql call; the maintenance loop repeats while a full batch comes back. */
export const JOB_PRUNE_BATCH = 5000;
/** Error text of a job buried by the consumer because its payload failed the contract (no content). */
export const INVALID_PAYLOAD_ERROR = 'invalid payload';
/** Error text of a job whose lock went stale (crashed or stuck worker). */
export const STALE_LOCK_ERROR = 'stale lock';

/**
 * Claim up to $3 ready jobs of type $1 for worker $2. Uses FOR UPDATE SKIP LOCKED so concurrent
 * consumers never take the same row.
 */
export const claimJobsSql = `
WITH next AS (
  SELECT id FROM jobs
  WHERE status = 'queued' AND type = $1::job_type AND run_after <= now()
  ORDER BY run_after, created_at
  LIMIT $3
  FOR UPDATE SKIP LOCKED
)
UPDATE jobs j
SET status = 'running', locked_by = $2, locked_at = now(), attempts = j.attempts + 1, updated_at = now()
FROM next
WHERE j.id = next.id
RETURNING j.id, j.type, j.payload, j.attempts, j.max_attempts`;

/** Mark done. $1 id, $2 result jsonb, $3 worker id. No row back: the lock was lost. */
export const completeJobSql = `
UPDATE jobs SET status = 'done', result = $2::jsonb, locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE id = $1 AND status = 'running' AND locked_by = $3
RETURNING id`;

/**
 * Mark failed with exponential backoff; becomes dead once attempts reach max_attempts.
 * $1 id, $2 error text (no personal data), $3 worker id. No row back: the lock was lost.
 */
export const failJobSql = `
UPDATE jobs SET
  status = CASE WHEN attempts >= max_attempts THEN 'dead'::job_status ELSE 'queued'::job_status END,
  error = $2,
  run_after = now() + make_interval(secs => least(3600, 15 * power(2, attempts))),
  locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE id = $1 AND status = 'running' AND locked_by = $3
RETURNING id, status`;

/**
 * Bury at once without retry: invalid payload or a type without a contract schema.
 * $1 id, $2 error text (no personal data), $3 worker id.
 */
export const buryJobSql = `
UPDATE jobs SET status = 'dead', error = $2, locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE id = $1 AND status = 'running' AND locked_by = $3
RETURNING id`;

/** Renew the lock of a running job. $1 id, $2 worker id. No row back: the lock was lost. */
export const heartbeatJobSql = `
UPDATE jobs SET locked_at = now(), updated_at = now()
WHERE id = $1 AND status = 'running' AND locked_by = $2
RETURNING id`;

/**
 * Running jobs whose lock is older than $1 seconds (crashed or stuck worker) go back to the queue, or are buried
 * when their attempts are used up. The claim already counted the attempt.
 */
export const releaseStaleJobsSql = `
UPDATE jobs SET
  status = CASE WHEN attempts >= max_attempts THEN 'dead'::job_status ELSE 'queued'::job_status END,
  error = 'stale lock',
  locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE status = 'running' AND locked_at < now() - make_interval(secs => $1)
RETURNING id, status`;

/**
 * Delete finished rows: done older than $1 days, failed and dead older than $2 days, at most $3 rows per call.
 * notification_deliveries rows go with their job (ON DELETE CASCADE). Returns { deleted }.
 */
export const pruneJobsSql = `
WITH gone AS (
  DELETE FROM jobs WHERE id IN (
    SELECT id FROM jobs
    WHERE (status = 'done' AND updated_at < now() - make_interval(days => $1))
       OR (status IN ('failed', 'dead') AND updated_at < now() - make_interval(days => $2))
    LIMIT $3
  )
  RETURNING 1
)
SELECT count(*)::int AS deleted FROM gone`;

/**
 * Enqueue. $1 type, $2 payload jsonb, $3 dedupe key or null, $4 run_after or null (now). A key that is queued or
 * running drops the insert (jobs_dedupe_active_uq). Returns the new id, or no row when dropped.
 */
export const enqueueJobSql = `
INSERT INTO jobs (type, payload, dedupe_key, run_after)
VALUES ($1::job_type, $2::jsonb, $3::text, coalesce($4::timestamptz, now()))
ON CONFLICT DO NOTHING
RETURNING id`;

/**
 * Enqueue once per key in any state (also done, failed or dead, until pruned). For daily and scheduled producers
 * whose "already queued today" memory would otherwise live only in process memory. $1 type, $2 payload jsonb,
 * $3 dedupe key (required), $4 run_after or null (now). Two producers racing on a new key are settled by
 * jobs_dedupe_active_uq. Returns the new id, or no row when the key exists.
 */
export const enqueueOnceSql = `
INSERT INTO jobs (type, payload, dedupe_key, run_after)
SELECT $1::job_type, $2::jsonb, $3::text, coalesce($4::timestamptz, now())
WHERE $3::text IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM jobs WHERE type = $1::job_type AND dedupe_key = $3::text)
ON CONFLICT DO NOTHING
RETURNING id`;

/** notification_deliveries (ADR-0035): targets of notify.send job $1 that were already delivered. */
export const deliveredTargetsSql = `
SELECT channel, target_hash FROM notification_deliveries WHERE job_id = $1`;

/**
 * Record one delivery right after it succeeded. $1 job id, $2 channel (email, web_push, apns), $3 target hash:
 * 'email' for e-mail, otherwise HMAC-SHA256 (lower case hex) of the endpoint or device token, never the raw value.
 */
export const recordDeliverySql = `
INSERT INTO notification_deliveries (job_id, channel, target_hash) VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING`;

export interface ClaimedJob {
  id: string;
  type: JobType;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

/** Minimal SQL client surface (pg.Pool, pg.Client and PGlite all fit). */
export interface JobsClient {
  query<R = unknown>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

/** A producer passed a payload that the contract refuses; the message names the type only. */
export class InvalidJobPayload extends Error {
  override name = 'InvalidJobPayload';
  constructor(
    readonly type: JobType,
    readonly reason: 'invalid_payload' | 'no_schema',
  ) {
    super(`payload refused for job type ${type} (${reason})`);
  }
}

export type EnqueueOptions =
  { once?: false; dedupeKey?: string; runAfter?: Date } | { once: true; dedupeKey: string; runAfter?: Date };

/**
 * Validate the payload against the contract and enqueue (ADR-0035). Throws InvalidJobPayload before anything is
 * written. With once, a key seen in any state is not enqueued again. Returns the id, or null when deduplicated.
 */
export async function enqueueJob<T extends JobTypeWithPayload>(
  db: JobsClient,
  type: T,
  payload: JobPayloadInput<T>,
  opts: EnqueueOptions = {},
): Promise<string | null> {
  const parsed = parseJobPayload(type, payload);
  if (!parsed.success) throw new InvalidJobPayload(type, parsed.reason);
  const { rows } = await db.query<{ id: string }>(opts.once ? enqueueOnceSql : enqueueJobSql, [
    type,
    JSON.stringify(parsed.data),
    opts.dedupeKey ?? null,
    opts.runAfter?.toISOString() ?? null,
  ]);
  return rows[0]?.id ?? null;
}
