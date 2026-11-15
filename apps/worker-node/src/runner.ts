import type { JobType } from '@kazuist/contracts';
import {
  JOB_PRUNE_BATCH,
  JOB_RETENTION_DAYS,
  JOB_STALE_SECONDS,
  jobsChannel,
  pruneJobsSql,
  releaseStaleJobsSql,
} from '@kazuist/db/jobs';
import { safeErrorFields, type ServiceLog } from '@kazuist/log';
import type { JobConsumer, SqlClient } from './queue.ts';

/**
 * Worker loop over the jobs contract (plan Ek C.3, ADR-0035): LISTEN jobs_<type> for low latency, poll as a
 * fallback, return stale locks of crashed workers (or bury them when their attempts are used up), prune finished
 * jobs once a day, stop cleanly on SIGTERM (finish the job in hand, claim nothing new).
 */

/** Worker log sink (@kazuist/log serviceLog in production); fields are primitives by type. */
export type Log = ServiceLog;

/** Subscribe to NOTIFY channels; resolves to an unsubscribe function. */
export type Listen = (
  channels: string[],
  onNotify: (channel: string) => void,
) => Promise<() => Promise<void>>;

export interface WorkerOptions {
  db: SqlClient;
  consumer: JobConsumer;
  listen: Listen;
  /** Poll interval when no notification arrives (default 5 s). */
  pollMs?: number;
  /** Jobs claimed per round and type (default 5). */
  batch?: number;
  /** A running job whose lock is older than this returns to the queue (default JOB_STALE_SECONDS, 15 min). */
  staleLockSeconds?: number;
  /** Interval of the finished job cleanup (default one day; 0 turns it off). */
  pruneEveryMs?: number;
  /** Extra periodic task, for example daily scheduling (runs at most once per poll round). */
  tick?: () => Promise<void>;
  log?: Log;
}

export interface RunningWorker {
  /** Stop claiming, wait for the current job, unsubscribe. */
  stop(): Promise<void>;
  /** Resolves when the loop has ended. */
  readonly done: Promise<void>;
}

export function startWorker(o: WorkerOptions): RunningWorker {
  const log = o.log ?? (() => {});
  const pollMs = o.pollMs ?? 5000;
  const batch = o.batch ?? 5;
  const stale = o.staleLockSeconds ?? JOB_STALE_SECONDS;
  const pruneEvery = o.pruneEveryMs ?? 86_400_000;
  let lastPrune = -Infinity;
  /** Delete finished rows past their retention, in batches, at most once per pruneEvery. */
  const maintain = async () => {
    if (pruneEvery <= 0 || Date.now() - lastPrune < pruneEvery) return;
    lastPrune = Date.now();
    let deleted = 0;
    for (let i = 0; i < 20; i++) {
      const r = await o.db.query<{ deleted: number }>(pruneJobsSql, [
        JOB_RETENTION_DAYS.done,
        JOB_RETENTION_DAYS.dead,
        JOB_PRUNE_BATCH,
      ]);
      const n = r.rows[0]?.deleted ?? 0;
      deleted += n;
      if (n < JOB_PRUNE_BATCH) break;
    }
    if (deleted) log('jobs pruned', { deleted });
  };
  const byChannel = new Map<string, JobType>(o.consumer.types.map((t) => [jobsChannel(t), t]));
  const pending = new Set<JobType>(o.consumer.types);
  let running = true;
  let wake: (() => void) | undefined;
  const nap = () =>
    new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        wake = undefined;
        resolve();
      };
      const timer = setTimeout(finish, pollMs);
      wake = finish;
    });

  const done = (async () => {
    const unlisten = await o.listen([...byChannel.keys()], (channel) => {
      const t = byChannel.get(channel);
      if (t) pending.add(t);
      wake?.();
    });
    log('listening', { channels: [...byChannel.keys()] });
    try {
      while (running) {
        try {
          const released = await o.db.query<{ id: string; status: string }>(releaseStaleJobsSql, [stale]);
          if (released.rows.length)
            log('stale locks released', {
              requeued: released.rows.filter((r) => r.status === 'queued').length,
              buried: released.rows.filter((r) => r.status === 'dead').length,
            });
          // Cleanup must not stop the queue from draining either.
          try {
            await maintain();
          } catch (err) {
            log('prune failed', safeErrorFields(err));
          }
          // A failing tick must not stop the queue from draining.
          if (o.tick) {
            try {
              await o.tick();
            } catch (err) {
              log('tick failed', safeErrorFields(err));
            }
          }
          // A poll round tries every type; a notification round only the notified ones.
          const round = pending.size ? [...pending] : [...o.consumer.types];
          pending.clear();
          for (const t of round) {
            while (running && (await o.consumer.runOnce(t, batch)) > 0) {
              /* drain this type */
            }
          }
        } catch (err) {
          // Database unreachable or similar: log the sanitized error only and retry after the poll interval.
          log('round failed', safeErrorFields(err));
        }
        if (running && pending.size === 0) await nap();
      }
    } finally {
      await unlisten().catch(() => undefined);
      log('stopped');
    }
  })();

  return {
    done,
    async stop() {
      running = false;
      wake?.();
      await done;
    },
  };
}

/** The pg.PoolClient surface LISTEN needs. */
export interface ListenClient {
  query(sql: string): Promise<unknown>;
  on(event: 'notification', fn: (msg: { channel: string }) => void): unknown;
  on(event: 'error', fn: (err: Error) => void): unknown;
  on(event: 'end', fn: () => void): unknown;
  /** Passing an error (or true) destroys the connection instead of returning it to the pool. */
  release(err?: Error | boolean): void;
}

/** Minimal pg.Pool surface for LISTEN (a dedicated client kept for the lifetime of the worker). */
export interface ListenPool {
  connect(): Promise<ListenClient>;
}

export interface ListenOptions {
  log?: Log;
  /** First reconnect delay (default 1 s); doubles per failed attempt up to maxDelayMs. */
  minDelayMs?: number;
  /** Ceiling of the reconnect delay (default 30 s). */
  maxDelayMs?: number;
}

/**
 * LISTEN over node-postgres. Channel names come from jobsChannel (letters, digits, underscores only).
 *
 * A checked out pg client has no error listener of the pool's, so a dropped connection (PostgreSQL restart,
 * failover, pg_terminate_backend, network cut) emitted an unhandled 'error' and killed the process. The client now
 * has its own 'error' and 'end' listeners: the broken client is destroyed and a new one LISTENs again with
 * exponential backoff. Polling keeps the queue draining meanwhile; after a reconnect every channel is reported once,
 * because notifications sent while disconnected are lost. The first connect still throws, so a worker that cannot
 * reach the database at start exits and the platform restarts it.
 */
export function pgListen(pool: ListenPool, options: ListenOptions = {}): Listen {
  const log = options.log ?? (() => {});
  const minDelay = options.minDelayMs ?? 1000;
  const maxDelay = options.maxDelayMs ?? 30_000;
  return async (channels, onNotify) => {
    for (const c of channels) {
      if (!/^[a-z0-9_]+$/.test(c)) throw new Error('invalid channel name');
    }
    let stopped = false;
    let current: (() => Promise<void>) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const schedule = () => {
      if (stopped || timer) return;
      const delay = Math.min(maxDelay, minDelay * 2 ** attempt);
      attempt++;
      timer = setTimeout(() => {
        timer = undefined;
        void reconnect();
      }, delay);
    };

    /** Connects and LISTENs; resolves to a close function that UNLISTENs and returns the client to the pool. */
    const subscribe = async (): Promise<() => Promise<void>> => {
      const client = await pool.connect();
      // done: this client is finished (lost or closed); later events on it are ignored.
      let done = false;
      let ready = false;
      const close = async () => {
        if (done) return;
        done = true;
        if (current === close) current = undefined;
        await client.query('UNLISTEN *').catch(() => undefined);
        client.release();
      };
      const lose = (err?: Error) => {
        if (done) return;
        done = true;
        if (current === close) current = undefined;
        // Never return a broken connection to the pool.
        try {
          client.release(err ?? true);
        } catch {
          /* already released */
        }
        // A failure during setup is reported by the throw below; only a live subscription schedules here.
        if (ready && !stopped) {
          log('listen connection lost', err ? safeErrorFields(err) : { error: 'end' });
          schedule();
        }
      };
      client.on('error', (err) => lose(err));
      client.on('end', () => lose());
      client.on('notification', (msg) => {
        if (!done) onNotify(msg.channel);
      });
      try {
        for (const c of channels) await client.query(`LISTEN ${c}`);
      } catch (err) {
        lose(err instanceof Error ? err : undefined);
        throw err;
      }
      if (done) throw new Error('listen connection lost during setup');
      ready = true;
      return close;
    };

    async function reconnect(): Promise<void> {
      if (stopped) return;
      try {
        const close = await subscribe();
        if (stopped) {
          await close();
          return;
        }
        current = close;
        log('listen reconnected', { attempts: attempt });
        attempt = 0;
        // Anything notified while disconnected was lost: let the loop look at every type once.
        for (const c of channels) onNotify(c);
      } catch (err) {
        log('listen reconnect failed', { ...safeErrorFields(err), attempt });
        schedule();
      }
    }

    current = await subscribe();
    return async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await current?.();
    };
  };
}
