import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from '../src/instrumentation.ts';
import {
  cachedPing,
  createHealthDeps,
  sharedPool,
  sharedValkey,
  type ClientFactories,
} from '../src/server/deps.ts';
import { criticalEnv } from '../src/server/env.ts';
import { checkHealth, currentHealthDeps, setHealthDeps } from '../src/server/health.ts';

const allEnv = Object.fromEntries(criticalEnv.map((k) => [k, 'set']));

function fakes(reply = 'PONG', mailUp = true) {
  const calls: string[] = [];
  const factories: ClientFactories = {
    pool: (url) => ({
      query: async (sql: string) => {
        calls.push(`pg ${url} ${sql}`);
        return { rows: [{ '?column?': 1 }] };
      },
    }),
    valkey: (url) => ({
      ping: async () => {
        calls.push(`valkey ${url} PING`);
        return reply;
      },
    }),
    mail: (url) => ({
      verify: async () => {
        calls.push(`mail ${url} VERIFY`);
        if (!mailUp) throw new Error('ECONNREFUSED');
        return true;
      },
    }),
  };
  return { calls, factories };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('health probes over pg and Valkey', () => {
  it('runs SELECT 1, PING and an SMTP verify against the configured URLs', async () => {
    const { calls, factories } = fakes();
    const env = {
      ...allEnv,
      DATABASE_URL: 'postgres://db',
      VALKEY_URL: 'redis://kv',
      MAIL_SMTP_URL: 'smtp://m',
    };
    expect(await checkHealth(env, createHealthDeps(env, factories))).toEqual({
      status: 200,
      body: { status: 'ok' },
    });
    expect(calls).toEqual(['pg postgres://db SELECT 1', 'valkey redis://kv PING', 'mail smtp://m VERIFY']);
  });

  it('an unreachable SMTP server is degraded with 200; the verify is cached between probes', async () => {
    const { calls, factories } = fakes('PONG', false);
    const deps = createHealthDeps(allEnv, factories);
    expect(await checkHealth(allEnv, deps)).toEqual({ status: 200, body: { status: 'degraded' } });
    expect(await checkHealth(allEnv, deps)).toEqual({ status: 200, body: { status: 'degraded' } });
    expect(calls.filter((c) => c.startsWith('mail'))).toHaveLength(1);
  });

  it('a slow SMTP server is degraded for that probe and its late answer serves the next one', async () => {
    vi.useFakeTimers();
    let answer: () => void = () => {};
    const slow = cachedPing(() => new Promise<void>((resolve) => (answer = resolve)));
    const first = checkHealth(allEnv, { database: async () => {}, valkey: async () => {}, mail: slow });
    await vi.advanceTimersByTimeAsync(1600);
    expect(await first).toEqual({ status: 200, body: { status: 'degraded' } });
    answer();
    expect(
      await checkHealth(allEnv, { database: async () => {}, valkey: async () => {}, mail: slow }),
    ).toEqual({
      status: 200,
      body: { status: 'ok' },
    });
  });

  it('a wrong PING reply is a failure', async () => {
    const { factories } = fakes('LOADING');
    expect((await checkHealth(allEnv, createHealthDeps(allEnv, factories))).status).toBe(503);
  });

  it('a missing URL rejects without creating a client', async () => {
    const { calls, factories } = fakes();
    const deps = createHealthDeps({ VALKEY_URL: 'redis://kv' }, factories);
    await expect(deps.database()).rejects.toThrow('not configured');
    expect(calls).toEqual([]);
  });

  it('a probe that does not answer within the timeout makes the service degraded', async () => {
    vi.useFakeTimers();
    const pending = checkHealth(allEnv, { database: () => new Promise(() => {}), valkey: async () => {} });
    await vi.advanceTimersByTimeAsync(1600);
    expect(await pending).toEqual({ status: 503, body: { status: 'degraded' } });
  });

  it('cachedPing reuses a success for okMs, a failure for failMs and shares one attempt', async () => {
    let t = 0;
    let calls = 0;
    let fail = false;
    const ping = cachedPing(
      async () => {
        calls++;
        if (fail) throw new Error('down');
      },
      1000,
      100,
      () => t,
    );
    await Promise.all([ping(), ping(), ping()]);
    expect(calls).toBe(1);
    t = 999;
    await ping();
    expect(calls).toBe(1);
    t = 1000;
    fail = true;
    await expect(ping()).rejects.toThrow('down');
    expect(calls).toBe(2);
    t = 1099;
    await expect(ping()).rejects.toThrow('down');
    expect(calls).toBe(2);
    t = 1100;
    fail = false;
    await ping();
    expect(calls).toBe(3);
  });

  it('instrumentation registers the real probes in the Node.js runtime only', async () => {
    const marker = { database: async () => {}, valkey: async () => {} };
    setHealthDeps(marker);
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await register();
    expect(currentHealthDeps()).toBe(marker);

    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('DATABASE_URL', '');
    await register();
    expect(currentHealthDeps()).not.toBe(marker);
    await expect(currentHealthDeps().database()).rejects.toThrow('not configured');
    vi.stubEnv('MAIL_SMTP_URL', '');
    await register();
    await expect(currentHealthDeps().mail?.()).rejects.toThrow('not configured');
  });

  it('shared clients are created once per URL and do not connect on creation', async () => {
    const a = sharedPool('postgres://kazuist@127.0.0.1:1/none');
    expect(sharedPool('postgres://kazuist@127.0.0.1:1/none')).toBe(a);
    expect(a.totalCount).toBe(0);
    const v = sharedValkey('redis://127.0.0.1:1');
    expect(sharedValkey('redis://127.0.0.1:1')).toBe(v);
    expect(v.status).toBe('wait');
    v.disconnect();
    await a.end();
  });
});

/**
 * Runs against real services when given, for example with infra/docker-compose.dev.yml up (Mailpit answers SMTP on
 * 127.0.0.1:1025).
 */
const itDb = process.env.KAZUIST_IT_DATABASE_URL;
const itKv = process.env.KAZUIST_IT_VALKEY_URL;
const itSmtp = process.env.KAZUIST_IT_SMTP_URL;
describe.skipIf(!itDb || !itKv || !itSmtp)('health probes against real PostgreSQL, Valkey and SMTP', () => {
  it('answers 200 ok, and 200 degraded when the SMTP port is closed', async () => {
    const env = { ...allEnv, DATABASE_URL: itDb, VALKEY_URL: itKv, MAIL_SMTP_URL: itSmtp };
    expect(await checkHealth(env, createHealthDeps(env))).toEqual({ status: 200, body: { status: 'ok' } });
    const closed = { ...env, MAIL_SMTP_URL: 'smtp://127.0.0.1:1' };
    expect(await checkHealth(closed, createHealthDeps(closed))).toEqual({
      status: 200,
      body: { status: 'degraded' },
    });
    await sharedPool(itDb as string).end();
    sharedValkey(itKv as string).disconnect();
  });
});
