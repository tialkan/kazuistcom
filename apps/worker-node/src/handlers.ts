import type { JobType } from '@kazuist/contracts';
import { billingHandlers, enqueueDailyBillingSql, type BillingJobsDeps } from './billing/jobs.ts';
import { createNotifyHandler, type NotifyDeps } from './notify/index.ts';
import type { JobHandler, SqlClient } from './queue.ts';

/**
 * Handler registry of worker-node (shared file, orchestrator). Module owners provide the handler factories:
 * notify.send (kimlik, src/notify), billing.monthly_grant and billing.reconcile (odeme, src/billing).
 */
export interface HandlerDeps {
  notify?: NotifyDeps;
  billing?: BillingJobsDeps;
}

export function buildHandlers(d: HandlerDeps): Partial<Record<JobType, JobHandler>> {
  return {
    ...(d.notify ? { 'notify.send': createNotifyHandler(d.notify) } : {}),
    ...(d.billing ? billingHandlers(d.billing) : {}),
  };
}

/**
 * Until odeme's Postgres billing store exists (docs/istekler/odeme-abonelik-ve-siparis-alanlari.md, Sonuc),
 * billing jobs fail closed with this error class instead of waiting silently in the queue.
 */
export class BillingStoreUnavailable extends Error {
  override name = 'BillingStoreUnavailable';
}
export const unavailableBilling: BillingJobsDeps = {
  monthlyGrant: () => Promise.reject(new BillingStoreUnavailable()),
  reconcileDay: () => Promise.reject(new BillingStoreUnavailable()),
  now: () => new Date(),
};

/** UTC day string, YYYY-MM-DD. */
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Daily billing schedule (plan 9.2/3 and 9.2/5): once a day per job type, keyed by the day, through odeme's
 * enqueueDailyBillingSql (the partial unique index drops a repeat while the first is queued or running).
 * Returns a tick for the runner that enqueues at most once per UTC day per process.
 */
export function dailyBillingTick(db: SqlClient, now: () => Date = () => new Date()): () => Promise<void> {
  let last = '';
  return async () => {
    const today = day(now());
    if (today === last) return;
    const yesterday = day(new Date(now().getTime() - 86_400_000));
    await db.query(enqueueDailyBillingSql, ['billing.monthly_grant', '{}', today]);
    await db.query(enqueueDailyBillingSql, ['billing.reconcile', JSON.stringify({ day: yesterday }), today]);
    last = today;
  };
}
