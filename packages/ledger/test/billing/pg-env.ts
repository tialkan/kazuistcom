/** PGlite with every migration, the price catalog, plan roles and one user. */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { PRICE_TABLE_V1 } from '../../src/index.ts';
import type { SqlClient } from '../../src/pg.ts';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { PgBillingStore } from '../../src/billing/pg-store.ts';

export async function pgBillingEnv() {
  const pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder });
  const db = pg as unknown as SqlClient;
  const store = new PgBillingStore(db, (id) => `hash-${id}`);
  await store.ensureCatalog(PRICE_TABLE_V1);
  await pg.query(
    "insert into roles (id, description) values ('plus', 'p'), ('akademisyen', 'a') on conflict do nothing",
  );
  const { rows } = await pg.query<{ id: string }>(
    "insert into users (email) values ('o@example.invalid') returning id",
  );
  return { pg, db, store, userId: (rows[0] as { id: string }).id };
}
