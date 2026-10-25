/**
 * Real BillingJobsDeps over Postgres (replaces unavailableBilling in src/handlers.ts once the orchestrator
 * switches main.ts). Needs DATABASE_URL (pool), IYZICO_API_KEY, IYZICO_SECRET_KEY and BETTER_AUTH_SECRET
 * (consent subject hash); returns undefined when any is missing so the jobs stay fail closed.
 *
 * The daily billing.monthly_grant job also ends periods canceled with donem_sonu and runs the dunning
 * retries (4.5/10), so one daily tick covers every time based billing rule.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { PRICE_TABLE_V1 } from '@kazuist/ledger';
import {
  BillingService,
  UnconfiguredEArsiv,
  HttpIyzico,
  IYZICO_SANDBOX_BASE_URL,
  PgBillingStore,
  PgLedgerPort,
} from '@kazuist/ledger/billing';
import type { PoolLike, SqlClient } from '@kazuist/ledger/pg';
import type { BillingJobsDeps } from './jobs.ts';

/** Same keyed hash as kimlik's subjectHash (apps/web/src/server/auth/hash.ts). */
const subjectHash = (secret: string, id: string) =>
  createHmac('sha256', secret).update(`subject:${id}`).digest('hex');

export function depsFromService(svc: BillingService, now: () => Date = () => new Date()): BillingJobsDeps {
  return {
    now,
    /**
     * The daily chain (Y-N6): every step runs even when an earlier one failed; the names of failed steps
     * are reported in the job result. Pending payments, failed iyzico cancels and deletion hooks that did
     * not run are retried every day (Y-N2, Y-N3, Y-N4, O9).
     */
    async monthlyGrant() {
      const failed: string[] = [];
      const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
        try {
          return await fn();
        } catch {
          failed.push(name);
          return undefined;
        }
      };
      await step('closeEndedPeriods', () => svc.closeEndedPeriods());
      await step('recheckPendingOrders', () => svc.recheckPendingOrders());
      await step('reconcileCancellations', () => svc.reconcileCancellations());
      await step('reconcileDeletedAccounts', () => svc.reconcileDeletedAccounts());
      await step('runDunning', () => svc.runDunning());
      const granted = (await step('monthlyGrant', () => svc.monthlyGrant())) ?? 0;
      return { granted, failed };
    },
    reconcileDay: (day) => svc.reconcileDay(day),
  };
}

export async function billingDepsFromEnv(
  pool: SqlClient & PoolLike,
  env: Record<string, string | undefined> = process.env,
): Promise<BillingJobsDeps | undefined> {
  const { IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_MERCHANT_ID, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = env;
  // Empty strings count as missing (D2); the merchant id verifies subscription webhooks.
  if (!IYZICO_API_KEY || !IYZICO_SECRET_KEY || !IYZICO_MERCHANT_ID || !BETTER_AUTH_SECRET) return undefined;
  const store = new PgBillingStore(pool, (id) => subjectHash(BETTER_AUTH_SECRET, id));
  await store.ensureCatalog(PRICE_TABLE_V1);
  const svc = new BillingService({
    iyzico: new HttpIyzico({
      apiKey: IYZICO_API_KEY,
      secretKey: IYZICO_SECRET_KEY,
      merchantId: IYZICO_MERCHANT_ID,
      baseUrl: env.IYZICO_BASE_URL || IYZICO_SANDBOX_BASE_URL,
    }),
    iyzicoCfg: { secretKey: IYZICO_SECRET_KEY, merchantId: IYZICO_MERCHANT_ID },
    earsiv: new UnconfiguredEArsiv(),
    store,
    ledger: new PgLedgerPort(pool, pool),
    now: () => new Date(),
    newId: randomUUID,
    callbackBaseUrl: BETTER_AUTH_URL ?? '',
    webAddress: BETTER_AUTH_URL ?? '',
  });
  return depsFromService(svc);
}
