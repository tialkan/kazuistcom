import type { JobType } from '@kazuist/contracts';
import { claimJobsSql, completeJobSql, failJobSql, jobsChannel, type ClaimedJob } from '@kazuist/db/jobs';

/** Minimal SQL client surface (pg.Pool, pg.Client and PGlite all fit). */
export interface SqlClient {
  query<R = unknown>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export type JobHandler = (job: ClaimedJob) => Promise<unknown>;

/** Jobs consumer contract (plan Ek C.3). Handlers must be idempotent. */
export interface JobConsumer {
  readonly types: readonly JobType[];
  /** Claim and run up to `limit` jobs of one type; returns how many ran. */
  runOnce(type: JobType, limit?: number): Promise<number>;
  channels(): string[];
}

export function createConsumer(
  db: SqlClient,
  workerId: string,
  handlers: Partial<Record<JobType, JobHandler>>,
): JobConsumer {
  const types = Object.keys(handlers) as JobType[];
  return {
    types,
    channels: () => types.map(jobsChannel),
    async runOnce(type, limit = 5) {
      const handler = handlers[type];
      if (!handler) return 0;
      const { rows } = await db.query<ClaimedJob>(claimJobsSql, [type, workerId, limit]);
      for (const job of rows) {
        try {
          const result = await handler(job);
          await db.query(completeJobSql, [job.id, JSON.stringify(result ?? null)]);
        } catch (err) {
          const message = err instanceof Error ? err.name : 'Error';
          await db.query(failJobSql, [job.id, message]);
        }
      }
      return rows.length;
    },
  };
}
