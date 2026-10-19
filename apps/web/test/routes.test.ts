import { afterEach, describe, expect, it, vi } from 'vitest';
import { Health, Version } from '@kazuist/contracts';
import { GET as health } from '../src/app/api/health/route.ts';
import { GET as version } from '../src/app/api/version/route.ts';
import { criticalEnv } from '../src/server/env.ts';

afterEach(() => vi.unstubAllEnvs());

describe('/api/health', () => {
  it('returns 503 when a critical variable is missing', async () => {
    for (const k of criticalEnv) vi.stubEnv(k, '');
    const res = health();
    expect(res.status).toBe(503);
    const body = Health.parse(await res.json());
    expect(body.status).toBe('degraded');
    expect(JSON.stringify(body)).not.toContain('postgres://');
  });
  it('returns 200 when all are present', async () => {
    for (const k of criticalEnv) vi.stubEnv(k, 'set');
    const res = health();
    expect(res.status).toBe(200);
    expect(Health.parse(await res.json()).status).toBe('ok');
  });
});

it('/api/version matches the contract', async () => {
  expect(Version.safeParse(await version().json()).success).toBe(true);
});
