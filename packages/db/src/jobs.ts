import type { JobType } from '@kazuist/contracts';

/**
 * Job queue contract shared by apps/worker-node and services/worker-py (plan Ek C.3).
 * - Producers INSERT into jobs; a trigger sends NOTIFY on channel jobsChannel(type).
 * - Consumers LISTEN on their channels, and also poll, then claim with claimJobsSql.
 * - Every job is idempotent; payload carries ids, never personal data.
 */
export function jobsChannel(type: JobType): string {
  return `jobs_${type.replace(/\./g, '_')}`;
}

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

/** Mark done. $1 id, $2 result jsonb. */
export const completeJobSql = `
UPDATE jobs SET status = 'done', result = $2::jsonb, locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE id = $1 AND status = 'running'`;

/**
 * Mark failed with exponential backoff; becomes dead once attempts reach max_attempts.
 * $1 id, $2 error text (no personal data).
 */
export const failJobSql = `
UPDATE jobs SET
  status = CASE WHEN attempts >= max_attempts THEN 'dead'::job_status ELSE 'queued'::job_status END,
  error = $2,
  run_after = now() + make_interval(secs => least(3600, 15 * power(2, attempts))),
  locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE id = $1 AND status = 'running'`;

/** Return running jobs whose lock is older than $1 seconds to the queue (crashed worker). */
export const releaseStaleJobsSql = `
UPDATE jobs SET status = 'queued', locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE status = 'running' AND locked_at < now() - make_interval(secs => $1)`;

export interface ClaimedJob {
  id: string;
  type: JobType;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}
