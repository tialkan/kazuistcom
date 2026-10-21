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

/**
 * Probes are registered at server start by src/instrumentation.ts (pg SELECT 1, Valkey PING, see deps.ts).
 * Until then they reject, so a server whose wiring failed reports 503. The slot lives on globalThis because
 * instrumentation and route handlers may be separate module graphs in the Next.js build.
 */
const notWired: Ping = () => Promise.reject(new Error('not wired'));
const SLOT = Symbol.for('kazuist.server.healthDeps');
type Slot = typeof globalThis & { [SLOT]?: HealthDeps };

export function setHealthDeps(next: HealthDeps): void {
  (globalThis as Slot)[SLOT] = next;
}

export function currentHealthDeps(): HealthDeps {
  return (globalThis as Slot)[SLOT] ?? { database: notWired, valkey: notWired };
}

export async function checkHealth(
  env: Record<string, string | undefined> = process.env,
  d: HealthDeps = currentHealthDeps(),
): Promise<{ status: number; body: Health }> {
  if (missingEnv(env).length > 0) return { status: 503, body: { status: 'degraded' } };
  const results = await Promise.all([withTimeout(d.database), withTimeout(d.valkey)]);
  const ok = results.every(Boolean);
  return { status: ok ? 200 : 503, body: { status: ok ? 'ok' : 'degraded' } };
}
