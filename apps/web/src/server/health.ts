import type { Health } from '@kazuist/contracts';
import { logEvent } from '@kazuist/log';
import { missingEnv } from './env.ts';

/** A dependency probe resolves when reachable and rejects otherwise. */
export type Ping = () => Promise<void>;

/**
 * database and valkey are required: either down makes the service 503 (plan 14.4/2). mail is reported but not
 * required: an unreachable SMTP provider turns the body to "degraded" with HTTP 200. A 503 would make Traefik drop
 * web from the route (unhealthy container) and take the whole site to the maintenance page because sign in codes
 * cannot be mailed; the code flows already fail loudly on their own (plan 14.6). Uptime Kuma alerts on the body
 * (docs/runbook/izleme.md). A missing MAIL_SMTP_URL is a configuration error and stays 503 (server/env.ts).
 */
export interface HealthDeps {
  database: Ping;
  valkey: Ping;
  mail?: Ping;
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
  return (globalThis as Slot)[SLOT] ?? { database: notWired, valkey: notWired, mail: notWired };
}

/** Missing critical names go to the server log once per distinct set (plan 14.4/2, wt.52); never to the body. */
let lastMissing = '';
function warnMissing(names: string[]): void {
  const key = names.join(',');
  if (key === lastMissing) return;
  lastMissing = key;
  logEvent('warn', 'health', { warning: 'critical environment variables missing', names });
}

export async function checkHealth(
  env: Record<string, string | undefined> = process.env,
  d: HealthDeps = currentHealthDeps(),
): Promise<{ status: number; body: Health }> {
  const missing = missingEnv(env);
  if (missing.length > 0) {
    warnMissing(missing);
    return { status: 503, body: { status: 'degraded' } };
  }
  lastMissing = '';
  const [database, valkey, mail] = await Promise.all([
    withTimeout(d.database),
    withTimeout(d.valkey),
    withTimeout(d.mail ?? notWired),
  ]);
  if (!database || !valkey) return { status: 503, body: { status: 'degraded' } };
  return { status: 200, body: { status: mail ? 'ok' : 'degraded' } };
}
