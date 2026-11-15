import { logError } from '@kazuist/log';
import { Valkey } from 'iovalkey';
import nodemailer from 'nodemailer';
import pg from 'pg';
import type { HealthDeps, Ping } from './health.ts';

/**
 * Process wide infrastructure clients (docs/istekler/altyapi-health-pingleri.md, ADR-0023). Created lazily on
 * first use, so importing this module never opens a connection and a missing variable only fails its probe.
 * Kept on globalThis because Next.js may bundle instrumentation and route handlers into separate module
 * graphs; both must see the same pool and client.
 */

export interface SqlPing {
  query(sql: string): Promise<unknown>;
}
export interface ValkeyPing {
  ping(): Promise<string>;
}
export interface MailVerify {
  verify(): Promise<unknown>;
}

interface Shared {
  pool?: pg.Pool;
  poolUrl?: string;
  valkey?: Valkey;
  valkeyUrl?: string;
}
const SHARED = Symbol.for('kazuist.server.deps');
const shared = (): Shared => {
  const g = globalThis as typeof globalThis & { [SHARED]?: Shared };
  g[SHARED] ??= {};
  return g[SHARED];
};

/** Shared PostgreSQL pool (max 10). Idle client errors are absorbed; only the error class is logged. */
export function sharedPool(url: string): pg.Pool {
  const s = shared();
  if (!s.pool || s.poolUrl !== url) {
    const pool = new pg.Pool({
      connectionString: url,
      max: 10,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30_000,
    });
    pool.on('error', (err) => logError('pg.pool', err));
    s.pool = pool;
    s.poolUrl = url;
  }
  return s.pool;
}

/** Shared Valkey client (iovalkey, MIT). Connects on the first command; one retry per request. */
export function sharedValkey(url: string): Valkey {
  const s = shared();
  if (!s.valkey || s.valkeyUrl !== url) {
    const client = new Valkey(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000 });
    client.on('error', (err: Error) => logError('valkey', err));
    s.valkey = client;
    s.valkeyUrl = url;
  }
  return s.valkey;
}

/** Database probe: SELECT 1. */
export const pingDatabase =
  (db: SqlPing): Ping =>
  async () => {
    await db.query('SELECT 1');
  };

/** Valkey probe: PING must answer PONG. */
export const pingValkey =
  (client: ValkeyPing): Ping =>
  async () => {
    const reply = await client.ping();
    if (reply !== 'PONG') throw new Error('unexpected PING reply');
  };

/** SMTP probe: connect, greeting, STARTTLS and AUTH when the URL asks for them (nodemailer verify); sends nothing. */
export const pingMail =
  (transport: MailVerify): Ping =>
  async () => {
    await transport.verify();
  };

/**
 * Caches a probe result so that the container healthcheck (30 s) and Uptime Kuma do not open an SMTP session at the
 * provider on every call: a success is reused for okMs, a failure for failMs. Concurrent calls share one attempt;
 * an attempt that outlives the health timeout still lands in the cache for the next call.
 */
export function cachedPing(ping: Ping, okMs = 300_000, failMs = 60_000, now: () => number = Date.now): Ping {
  let until = -Infinity;
  let last: Promise<void> | undefined;
  let inflight: Promise<void> | undefined;
  return () => {
    if (last && now() < until) return last;
    if (inflight) return inflight;
    const attempt = ping().then(
      () => {
        until = now() + okMs;
      },
      (err: unknown) => {
        until = now() + failMs;
        throw err;
      },
    );
    inflight = attempt;
    const settle = () => {
      last = attempt;
      inflight = undefined;
    };
    attempt.then(settle, settle);
    return attempt;
  };
}

/** SMTP transport used only by the probe; short timeouts so a hung provider is a failure, not a stuck socket. */
function mailTransport(url: string): MailVerify {
  return nodemailer.createTransport({
    url,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
}

export interface ClientFactories {
  pool: (url: string) => SqlPing;
  valkey: (url: string) => ValkeyPing;
  mail: (url: string) => MailVerify;
}
const realFactories: ClientFactories = { pool: sharedPool, valkey: sharedValkey, mail: mailTransport };

/**
 * Probes for /api/health over the shared clients. A missing URL rejects without creating a client. The mail probe
 * keeps one transport per process and caches its result (cachedPing).
 */
export function createHealthDeps(
  env: Record<string, string | undefined> = process.env,
  factories: ClientFactories = realFactories,
): HealthDeps {
  const probe =
    (name: 'DATABASE_URL' | 'VALKEY_URL' | 'MAIL_SMTP_URL', make: (url: string) => Ping): Ping =>
    () => {
      const url = env[name];
      return url ? make(url)() : Promise.reject(new Error('not configured'));
    };
  let mailPing: Ping | undefined;
  return {
    database: probe('DATABASE_URL', (url) => pingDatabase(factories.pool(url))),
    valkey: probe('VALKEY_URL', (url) => pingValkey(factories.valkey(url))),
    mail: probe('MAIL_SMTP_URL', (url) => {
      mailPing ??= cachedPing(pingMail(factories.mail(url)));
      return mailPing;
    }),
  };
}
