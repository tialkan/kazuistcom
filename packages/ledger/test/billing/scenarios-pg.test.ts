/** The same 9.5 scenarios on PGlite with every migration: PgBillingStore and the Postgres ledger port. */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { PRICE_TABLE_V1 } from '../../src/index.ts';
import type { SqlClient } from '../../src/pg.ts';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { PgBillingStore, PgLedgerPort } from '../../src/billing/pg-store.ts';
import { runScenarios } from './scenarios.suite.ts';

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

runScenarios('postgres store on PGlite', async () => {
  const { pg, db, store, userId } = await pgBillingEnv();
  return {
    store,
    ledger: new PgLedgerPort(db),
    userId,
    consentKinds: async () =>
      (
        await pg.query<{ kind: string }>('select kind::text kind from consents where user_id = $1', [userId])
      ).rows.map((r) => r.kind),
    alertCount: async () =>
      (await pg.query<{ n: number }>("select count(*)::int n from audit_log where action like 'billing.%'"))
        .rows[0]?.n ?? 0,
    addCoupon: async (c) => {
      await pg.query(
        'insert into coupons (code, credits, percent_off, max_redemptions, redeemed, valid_until) values ($1, $2, $3, $4, $5, $6)',
        [c.code, c.credits, c.percentOff, c.maxRedemptions, c.redeemed, c.validUntil],
      );
    },
    close: () => pg.close(),
  };
});
