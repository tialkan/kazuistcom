import type { Health } from '@kazuist/contracts';
import { missingEnv } from './env.ts';

/** A dependency probe resolves when reachable and rejects otherwise. */
export type Ping = () => Promise<void>;

export interface HealthDeps {
  database: Ping;
  valkey: Ping;
}

const PING_TIMEOUT_MS = 1500;

function withTimeout(ping: Ping): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    ping().then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

/** Default probes until altyapi wires real clients (pg SELECT 1, Valkey PING): unreachable. */
const notWired: Ping = () => Promise.reject(new Error('not wired'));
let deps: HealthDeps = { database: notWired, valkey: notWired };

export function setHealthDeps(next: HealthDeps): void {
  deps = next;
}

export async function checkHealth(
  env: Record<string, string | undefined> = process.env,
  d: HealthDeps = deps,
): Promise<{ status: number; body: Health }> {
  if (missingEnv(env).length > 0) return { status: 503, body: { status: 'degraded' } };
  const results = await Promise.all([withTimeout(d.database), withTimeout(d.valkey)]);
  const ok = results.every(Boolean);
  return { status: ok ? 200 : 503, body: { status: ok ? 'ok' : 'degraded' } };
}
