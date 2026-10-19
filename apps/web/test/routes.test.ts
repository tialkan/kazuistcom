import { afterEach, describe, expect, it, vi } from 'vitest';
import { Health, Version } from '@kazuist/contracts';
import { GET as health } from '../src/app/api/health/route.ts';
import { GET as version } from '../src/app/api/version/route.ts';
import { criticalEnv } from '../src/server/env.ts';
import { checkHealth, setHealthDeps } from '../src/server/health.ts';

afterEach(() => vi.unstubAllEnvs());
const allEnv = Object.fromEntries(criticalEnv.map((k) => [k, 'set']));
const up = () => Promise.resolve();
const down = () => Promise.reject(new Error('down'));

describe('/api/health', () => {
  it('returns 503 without leaking names when a variable is missing', async () => {
    for (const k of criticalEnv) vi.stubEnv(k, '');
    const res = await health();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(Health.parse(JSON.parse(text))).toEqual({ status: 'degraded' });
    for (const k of criticalEnv) expect(text).not.toContain(k);
  });
  it('returns 200 only when env is set and database and valkey answer', async () => {
    expect(await checkHealth(allEnv, { database: up, valkey: up })).toEqual({
      status: 200,
      body: { status: 'ok' },
    });
    expect((await checkHealth(allEnv, { database: down, valkey: up })).status).toBe(503);
    expect((await checkHealth(allEnv, { database: up, valkey: down })).status).toBe(503);
  });
  it('route uses registered probes', async () => {
    for (const k of criticalEnv) vi.stubEnv(k, 'set');
    setHealthDeps({ database: up, valkey: up });
    expect((await health()).status).toBe(200);
    setHealthDeps({ database: down, valkey: up });
    expect((await health()).status).toBe(503);
  });
});

it('/api/version matches the contract', async () => {
  expect(Version.safeParse(await version().json()).success).toBe(true);
});
