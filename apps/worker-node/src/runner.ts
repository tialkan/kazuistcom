import type { JobType } from '@kazuist/contracts';
import { jobsChannel, releaseStaleJobsSql } from '@kazuist/db/jobs';
import type { JobConsumer, SqlClient } from './queue.ts';

/**
 * Worker loop over the jobs contract (plan Ek C.3): LISTEN jobs_<type> for low latency, poll as a fallback,
 * return stale locks of crashed workers, stop cleanly on SIGTERM (finish the job in hand, claim nothing new).
 */

export type Log = (msg: string, extra?: Record<string, unknown>) => void;

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
  /** A running job whose lock is older than this returns to the queue (default 15 min). */
  staleLockSeconds?: number;
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
  const stale = o.staleLockSeconds ?? 900;
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
          await o.db.query(releaseStaleJobsSql, [stale]);
          // A failing tick must not stop the queue from draining.
          if (o.tick) {
            try {
              await o.tick();
            } catch (err) {
              log('tick failed', { error: err instanceof Error ? err.name : 'Error' });
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
          // Database unreachable or similar: log the class only and retry after the poll interval.
          log('round failed', { error: err instanceof Error ? err.name : 'Error' });
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

/** Minimal pg.Pool surface for LISTEN (a dedicated client kept for the lifetime of the worker). */
export interface ListenPool {
  connect(): Promise<{
    query(sql: string): Promise<unknown>;
    on(event: 'notification', fn: (msg: { channel: string }) => void): unknown;
    release(): void;
  }>;
}

/** LISTEN over node-postgres. Channel names come from jobsChannel (letters, digits, underscores only). */
export function pgListen(pool: ListenPool): Listen {
  return async (channels, onNotify) => {
    const client = await pool.connect();
    client.on('notification', (msg) => onNotify(msg.channel));
    for (const c of channels) {
      if (!/^[a-z0-9_]+$/.test(c)) throw new Error('invalid channel name');
      await client.query(`LISTEN ${c}`);
    }
    return async () => {
      await client.query('UNLISTEN *').catch(() => undefined);
      client.release();
    };
  };
}
