/** The same 9.5 scenarios on PGlite with every migration: PgBillingStore and the Postgres ledger port. */
import { PgLedgerPort } from '../../src/billing/pg-store.ts';
import { pgBillingEnv } from './pg-env.ts';
import { runScenarios } from './scenarios.suite.ts';

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
