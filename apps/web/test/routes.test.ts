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
    expect(await checkHealth(allEnv, { database: up, valkey: up, mail: up })).toEqual({
      status: 200,
      body: { status: 'ok' },
    });
    expect((await checkHealth(allEnv, { database: down, valkey: up, mail: up })).status).toBe(503);
    expect((await checkHealth(allEnv, { database: up, valkey: down, mail: up })).status).toBe(503);
  });
  it('requires MAIL_SMTP_URL: without it the service is 503 and the name stays out of the body', async () => {
    expect(criticalEnv).toContain('MAIL_SMTP_URL');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await checkHealth({ ...allEnv, MAIL_SMTP_URL: '' }, { database: up, valkey: up, mail: up });
    expect(res).toEqual({ status: 503, body: { status: 'degraded' } });
    expect(JSON.stringify(res.body)).not.toContain('MAIL');
    // The server log names the variable once (plan 14.4/2), not on every probe.
    await checkHealth({ ...allEnv, MAIL_SMTP_URL: '' }, { database: up, valkey: up, mail: up });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('MAIL_SMTP_URL');
    warn.mockRestore();
  });
  it('an unreachable mail provider is reported as degraded with HTTP 200, not taken off the route', async () => {
    expect(await checkHealth(allEnv, { database: up, valkey: up, mail: down })).toEqual({
      status: 200,
      body: { status: 'degraded' },
    });
    expect(await checkHealth(allEnv, { database: up, valkey: up })).toEqual({
      status: 200,
      body: { status: 'degraded' },
    });
  });
  it('does not require object storage variables while no code uses S3', async () => {
    expect(criticalEnv).not.toContain('S3_ENDPOINT');
    expect(criticalEnv).not.toContain('S3_BUCKET');
    const withoutS3 = { ...allEnv, S3_ENDPOINT: undefined, S3_BUCKET: undefined };
    expect((await checkHealth(withoutS3, { database: up, valkey: up, mail: up })).status).toBe(200);
  });
  it('route uses registered probes', async () => {
    for (const k of criticalEnv) vi.stubEnv(k, 'set');
    setHealthDeps({ database: up, valkey: up, mail: up });
    const ok = await health();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'ok' });
    setHealthDeps({ database: down, valkey: up, mail: up });
    expect((await health()).status).toBe(503);
  });
});

it('/api/version matches the contract', async () => {
  expect(Version.safeParse(await version().json()).success).toBe(true);
});
