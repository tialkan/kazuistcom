import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { expect, it } from 'vitest';
import { migrationsFolder } from '../src/migrate.ts';
import { seed } from '../src/seed.ts';

it('seed script runs on a fresh migrated database with fictitious data only', async () => {
  const pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  const db = drizzle(pg);
  await migrate(db, { migrationsFolder });
  await seed(db);
  const r = await pg.query<{ email: string }>('select email from users');
  expect(r.rows.every((u) => u.email.endsWith('@example.invalid'))).toBe(true);
  await pg.close();
});
