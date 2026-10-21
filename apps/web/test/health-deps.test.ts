import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from '../src/instrumentation.ts';
import { createHealthDeps, sharedPool, sharedValkey, type ClientFactories } from '../src/server/deps.ts';
import { criticalEnv } from '../src/server/env.ts';
import { checkHealth, currentHealthDeps, setHealthDeps } from '../src/server/health.ts';

const allEnv = Object.fromEntries(criticalEnv.map((k) => [k, 'set']));

function fakes(reply = 'PONG') {
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
  };
  return { calls, factories };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('health probes over pg and Valkey', () => {
  it('runs SELECT 1 and PING against the configured URLs', async () => {
    const { calls, factories } = fakes();
    const env = { ...allEnv, DATABASE_URL: 'postgres://db', VALKEY_URL: 'redis://kv' };
    expect(await checkHealth(env, createHealthDeps(env, factories))).toEqual({
      status: 200,
      body: { status: 'ok' },
    });
    expect(calls).toEqual(['pg postgres://db SELECT 1', 'valkey redis://kv PING']);
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

/** Runs against real services when given, for example with infra/docker-compose.dev.yml up. */
const itDb = process.env.KAZUIST_IT_DATABASE_URL;
const itKv = process.env.KAZUIST_IT_VALKEY_URL;
describe.skipIf(!itDb || !itKv)('health probes against real PostgreSQL and Valkey', () => {
  it('answers 200', async () => {
    const env = { ...allEnv, DATABASE_URL: itDb, VALKEY_URL: itKv };
    expect((await checkHealth(env, createHealthDeps(env))).status).toBe(200);
    await sharedPool(itDb as string).end();
    sharedValkey(itKv as string).disconnect();
  });
});
