import { parseJobPayload, type JobType } from '@kazuist/contracts';
import {
  INVALID_PAYLOAD_ERROR,
  JOB_HEARTBEAT_SECONDS,
  buryJobSql,
  claimJobsSql,
  completeJobSql,
  failJobSql,
  heartbeatJobSql,
  jobsChannel,
  type ClaimedJob,
} from '@kazuist/db/jobs';
import { safeErrorFields, serviceLog, type ServiceLog } from '@kazuist/log';

/** Minimal SQL client surface (pg.Pool, pg.Client and PGlite all fit). */
export interface SqlClient {
  query<R = unknown>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export type JobHandler = (job: ClaimedJob) => Promise<unknown>;

/**
 * Log sink; messages carry ids, type names and sanitized error fields only, never payloads or text. Fields are
 * primitives by type (@kazuist/log, ADR-0039), so an error object cannot be passed.
 */
export type QueueLog = ServiceLog;

const jsonLog: QueueLog = serviceLog('worker-node');

export interface ConsumerOptions {
  /** Lock renewal interval while a handler runs (default JOB_HEARTBEAT_SECONDS, a third of the stale limit). */
  heartbeatMs?: number;
  log?: QueueLog;
}

/** Jobs consumer contract (plan Ek C.3, ADR-0035). Handlers must be idempotent. */
export interface JobConsumer {
  readonly types: readonly JobType[];
  /** Claim and run up to `limit` jobs of one type; returns how many were claimed. */
  runOnce(type: JobType, limit?: number): Promise<number>;
  channels(): string[];
}

/**
 * Consumer over the packages/db jobs statements. Per claimed job: the payload is checked against the contract
 * (an invalid one is buried as `invalid payload`, never retried and never logged), the lock is renewed while the
 * handler runs, and complete or fail match this worker's id. A worker whose lock was released as stale and taken
 * by another worker gets no row back: it logs "lock lost" and leaves the job to the new owner.
 */
export function createConsumer(
  db: SqlClient,
  workerId: string,
  handlers: Partial<Record<JobType, JobHandler>>,
  options: ConsumerOptions = {},
): JobConsumer {
  const types = Object.keys(handlers) as JobType[];
  const log = options.log ?? jsonLog;
  const beatMs = options.heartbeatMs ?? JOB_HEARTBEAT_SECONDS * 1000;
  const errorName = (err: unknown) => (err instanceof Error ? err.name : 'Error');
  const lost = (job: ClaimedJob, step: string) => log('lock lost', { jobId: job.id, type: job.type, step });

  async function run(job: ClaimedJob, handler: JobHandler): Promise<void> {
    const parsed = parseJobPayload(job.type, job.payload);
    if (!parsed.success) {
      const r = await db.query(buryJobSql, [job.id, INVALID_PAYLOAD_ERROR, workerId]);
      log('job buried', { jobId: job.id, type: job.type, reason: parsed.reason });
      if (!r.rows.length) lost(job, 'bury');
      return;
    }
    let reported = false;
    const timer = setInterval(() => {
      db.query(heartbeatJobSql, [job.id, workerId]).then(
        (r) => {
          if (!r.rows.length && !reported) {
            reported = true;
            lost(job, 'heartbeat');
          }
        },
        (err: unknown) => log('heartbeat failed', { jobId: job.id, ...safeErrorFields(err) }),
      );
    }, beatMs);
    timer.unref?.();
    try {
      const result = await handler({ ...job, payload: parsed.data });
      const r = await db.query(completeJobSql, [job.id, JSON.stringify(result ?? null), workerId]);
      if (!r.rows.length) lost(job, 'complete');
    } catch (err) {
      const r = await db.query(failJobSql, [job.id, errorName(err), workerId]);
      if (!r.rows.length) lost(job, 'fail');
    } finally {
      clearInterval(timer);
    }
  }

  return {
    types,
    channels: () => types.map(jobsChannel),
    async runOnce(type, limit = 5) {
      const handler = handlers[type];
      if (!handler) return 0;
      const { rows } = await db.query<ClaimedJob>(claimJobsSql, [type, workerId, limit]);
      for (const job of rows) await run(job, handler);
      return rows.length;
    },
  };
}
