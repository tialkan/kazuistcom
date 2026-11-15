import { logError } from '@kazuist/log';
import { Valkey } from 'iovalkey';
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

export interface ClientFactories {
  pool: (url: string) => SqlPing;
  valkey: (url: string) => ValkeyPing;
}
const realFactories: ClientFactories = { pool: sharedPool, valkey: sharedValkey };

/** Probes for /api/health over the shared clients. A missing URL rejects without creating a client. */
export function createHealthDeps(
  env: Record<string, string | undefined> = process.env,
  factories: ClientFactories = realFactories,
): HealthDeps {
  const probe =
    (name: 'DATABASE_URL' | 'VALKEY_URL', make: (url: string) => Ping): Ping =>
    () => {
      const url = env[name];
      return url ? make(url)() : Promise.reject(new Error('not configured'));
    };
  return {
    database: probe('DATABASE_URL', (url) => pingDatabase(factories.pool(url))),
    valkey: probe('VALKEY_URL', (url) => pingValkey(factories.valkey(url))),
  };
}
