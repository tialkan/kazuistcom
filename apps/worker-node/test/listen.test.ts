import { EventEmitter } from 'node:events';
import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pgListen, type ListenClient, type ListenPool } from '../src/runner.ts';

/** A pg.PoolClient stand in: emits like node-postgres, records queries and how it was released. */
class FakeClient extends EventEmitter implements ListenClient {
  readonly queries: string[] = [];
  released: Error | boolean | undefined | 'no' = 'no';
  failQuery = false;
  async query(sql: string) {
    if (this.failQuery) throw new Error('query failed');
    this.queries.push(sql);
    return {};
  }
  release(err?: Error | boolean) {
    if (this.released !== 'no') throw new Error('Release called on client which has already been released');
    this.released = err;
  }
}

function fakePool() {
  const clients: FakeClient[] = [];
  let failConnects = 0;
  const pool: ListenPool & { failNext(n: number): void } = {
    async connect() {
      if (failConnects > 0) {
        failConnects--;
        throw Object.assign(new Error('connect ECONNREFUSED'), { name: 'Error' });
      }
      const c = new FakeClient();
      clients.push(c);
      return c;
    },
    failNext(n) {
      failConnects = n;
    },
  };
  return { pool, clients };
}

afterEach(() => vi.useRealTimers());

describe('pgListen', () => {
  it('handles the error event of the LISTEN client instead of crashing, and reconnects', async () => {
    vi.useFakeTimers();
    const { pool, clients } = fakePool();
    const notified: string[] = [];
    const logs: string[] = [];
    const unlisten = await pgListen(pool, { log: (m) => logs.push(m), minDelayMs: 100 })(
      ['jobs_a', 'jobs_b'],
      (c) => notified.push(c),
    );
    expect(clients[0]?.queries).toEqual(['LISTEN jobs_a', 'LISTEN jobs_b']);

    // Without a listener EventEmitter throws on 'error'; this must not throw.
    expect(() => clients[0]?.emit('error', new Error('terminating connection'))).not.toThrow();
    // The broken client is destroyed (released with the error), never returned to the pool.
    expect(clients[0]?.released).toBeInstanceOf(Error);
    // The end event that pg emits after the error is ignored.
    clients[0]?.emit('end');
    expect(logs.filter((l) => l === 'listen connection lost')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(clients).toHaveLength(2);
    expect(clients[1]?.queries).toEqual(['LISTEN jobs_a', 'LISTEN jobs_b']);
    expect(logs).toContain('listen reconnected');
    // Notifications missed while disconnected: every channel is reported once.
    expect(notified).toEqual(['jobs_a', 'jobs_b']);

    // The new client delivers notifications; the old one is ignored.
    clients[1]?.emit('notification', { channel: 'jobs_b' });
    clients[0]?.emit('notification', { channel: 'jobs_a' });
    expect(notified).toEqual(['jobs_a', 'jobs_b', 'jobs_b']);

    await unlisten();
    expect(clients[1]?.queries.at(-1)).toBe('UNLISTEN *');
    expect(clients[1]?.released).toBeUndefined();
  });

  it('backs off exponentially up to the ceiling while the database is unreachable', async () => {
    vi.useFakeTimers();
    const { pool, clients } = fakePool();
    const logs: { msg: string; extra?: Record<string, unknown> }[] = [];
    const unlisten = await pgListen(pool, {
      log: (msg, extra) => logs.push({ msg, extra }),
      minDelayMs: 100,
      maxDelayMs: 400,
    })(['jobs_a'], () => {});
    pool.failNext(4);
    clients[0]?.emit('end');

    // Attempts at +100, +200, +400, +400 (ceiling) fail, the fifth at +400 succeeds.
    await vi.advanceTimersByTimeAsync(99);
    expect(logs.filter((l) => l.msg === 'listen reconnect failed')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(logs.filter((l) => l.msg === 'listen reconnect failed')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(199);
    expect(logs.filter((l) => l.msg === 'listen reconnect failed')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(logs.filter((l) => l.msg === 'listen reconnect failed')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(400);
    await vi.advanceTimersByTimeAsync(400);
    expect(logs.filter((l) => l.msg === 'listen reconnect failed')).toHaveLength(4);
    expect(clients).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(clients).toHaveLength(2);
    expect(logs.find((l) => l.msg === 'listen reconnected')?.extra).toEqual({ attempts: 5 });
    // Logs carry error class names only.
    for (const l of logs) expect(JSON.stringify(l)).not.toContain('ECONNREFUSED');

    // After a success the delay starts from the minimum again.
    clients[1]?.emit('error', new Error('again'));
    await vi.advanceTimersByTimeAsync(100);
    expect(clients).toHaveLength(3);
    await unlisten();
  });

  it('a LISTEN that fails on the new connection destroys it and retries', async () => {
    vi.useFakeTimers();
    const { pool, clients } = fakePool();
    const unlisten = await pgListen(pool, { minDelayMs: 50 })(['jobs_a'], () => {});
    const orig = pool.connect.bind(pool);
    let first = true;
    pool.connect = async () => {
      const c = (await orig()) as FakeClient;
      if (first) c.failQuery = true;
      first = false;
      return c;
    };
    clients[0]?.emit('error', new Error('gone'));
    await vi.advanceTimersByTimeAsync(50);
    expect(clients[1]?.released).toBeInstanceOf(Error);
    await vi.advanceTimersByTimeAsync(100);
    expect(clients[2]?.queries).toEqual(['LISTEN jobs_a']);
    await unlisten();
  });

  it('stops reconnecting once unlistened', async () => {
    vi.useFakeTimers();
    const { pool, clients } = fakePool();
    const unlisten = await pgListen(pool, { minDelayMs: 100 })(['jobs_a'], () => {});
    clients[0]?.emit('error', new Error('gone'));
    await unlisten();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(clients).toHaveLength(1);
  });

  it('the first connect still throws so a worker without a database exits at start', async () => {
    const { pool } = fakePool();
    pool.failNext(1);
    await expect(pgListen(pool)(['jobs_a'], () => {})).rejects.toThrow('ECONNREFUSED');
  });

  it('rejects channel names outside letters, digits and underscores before connecting', async () => {
    const { pool, clients } = fakePool();
    await expect(pgListen(pool)(['jobs_a; drop table jobs'], () => {})).rejects.toThrow(
      'invalid channel name',
    );
    expect(clients).toHaveLength(0);
  });
});

/**
 * Against a real PostgreSQL (CI docker job: KAZUIST_IT_DATABASE_URL): the LISTEN backend is killed with
 * pg_terminate_backend, which makes node-postgres emit 'error' on the checked out client, the way a PostgreSQL
 * restart or failover does. A NOTIFY sent after that must still arrive.
 */
const itDb = process.env.KAZUIST_IT_DATABASE_URL;
describe.skipIf(!itDb)('pgListen against real PostgreSQL', () => {
  it('survives pg_terminate_backend and receives NOTIFY on the new connection', async () => {
    const pool = new pg.Pool({ connectionString: itDb, max: 3 });
    pool.on('error', () => {});
    const channel = `jobs_ci_listen_${process.pid}`;
    const seen: string[] = [];
    const logs: string[] = [];
    const unlisten = await pgListen(pool, { log: (m) => logs.push(m), minDelayMs: 200 })([channel], (c) =>
      seen.push(c),
    );
    const until = async (cond: () => boolean, ms = 10_000) => {
      const end = Date.now() + ms;
      while (!cond()) {
        if (Date.now() > end) throw new Error('timed out');
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    try {
      await pool.query(`NOTIFY ${channel}`);
      await until(() => seen.length === 1);

      const killed = await pool.query<{ n: string }>(
        `SELECT count(pg_terminate_backend(pid))::text AS n FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid() AND query = $1`,
        [`LISTEN ${channel}`],
      );
      expect(killed.rows[0]?.n).toBe('1');
      await until(() => logs.includes('listen reconnected'));
      // The reconnect reports the channel once (missed notifications), then a real NOTIFY arrives.
      const before = seen.length;
      await pool.query(`NOTIFY ${channel}`);
      await until(() => seen.length === before + 1);
      expect(logs).toContain('listen connection lost');
    } finally {
      await unlisten();
      await pool.end();
    }
  }, 30_000);
});
