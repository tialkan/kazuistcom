import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { migrationsFolder } from './migrate.ts';

/**
 * One-shot migration entry (`@kazuist/db/migrate`, docs/istekler/altyapi-worker-giris-noktalari.md item 4).
 * Not exported from the package root, so bundles that import @kazuist/db never pull pg or the migrator.
 * Holds a session advisory lock so parallel deploys cannot migrate twice (plan 14.4/3).
 */

/** Same constant as infra/scripts/migrate.mjs; both must keep it while they coexist. */
export const MIGRATION_LOCK_KEY = 7302514001;

export interface LockClient {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export type MigrationLog = (msg: string, extra?: Record<string, unknown>) => void;

async function appliedCount(client: LockClient): Promise<number> {
  const r = await client.query<{ present: boolean }>(
    "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present",
  );
  if (!r.rows[0]?.present) return 0;
  const c = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
  return c.rows[0]?.n ?? 0;
}

/** Run `apply` while holding the migration advisory lock; reports how many migrations were applied. */
export async function withMigrationLock(
  client: LockClient,
  apply: () => Promise<void>,
  log: MigrationLog = () => {},
): Promise<{ appliedBefore: number; appliedAfter: number }> {
  log('waiting for advisory lock');
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  try {
    const appliedBefore = await appliedCount(client);
    log('lock acquired', { appliedBefore });
    await apply();
    const appliedAfter = await appliedCount(client);
    log('done', { appliedBefore, appliedAfter });
    return { appliedBefore, appliedAfter };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
  }
}

/** Apply every pending migration to `url` (node-postgres). The connection string is never logged. */
export async function runMigrations(
  url: string,
  log: MigrationLog = () => {},
): Promise<{ appliedBefore: number; appliedAfter: number }> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    return await withMigrationLock(client, () => migrate(drizzle({ client }), { migrationsFolder }), log);
  } finally {
    await client.end();
  }
}
