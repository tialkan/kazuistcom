import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { expect, it } from 'vitest';
import { migrationsFolder } from '../src/migrate.ts';
import { MIGRATION_LOCK_KEY, withMigrationLock } from '../src/run-migrations.ts';

it('applies under the advisory lock, releases it, and is a no-op the second time', async () => {
  const pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  const steps: string[] = [];
  const apply = () => migrate(drizzle(pg), { migrationsFolder });
  const first = await withMigrationLock(pg, apply, (m) => steps.push(m));
  expect(first.appliedBefore).toBe(0);
  expect(first.appliedAfter).toBeGreaterThanOrEqual(4);
  expect(steps).toEqual(['waiting for advisory lock', 'lock acquired', 'done']);
  const locks = await pg.query<{ n: number }>(
    "select count(*)::int n from pg_locks where locktype = 'advisory' and objid = $1",
    [MIGRATION_LOCK_KEY % 2 ** 32],
  );
  expect(locks.rows[0]?.n).toBe(0);
  const second = await withMigrationLock(pg, apply);
  expect(second).toEqual({ appliedBefore: first.appliedAfter, appliedAfter: first.appliedAfter });
  await pg.close();
});
