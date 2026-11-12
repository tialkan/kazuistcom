import type { JobType } from '@kazuist/contracts';
import { enqueueJob } from '@kazuist/db/jobs';
import { createPurgeHandler, type PurgeDeps } from './account/purge.ts';
import { billingHandlers, type BillingJobsDeps } from './billing/jobs.ts';
import { createKalemcikDailyHandler, type GunlukBagimliliklar } from './kalemcik/gunluk.ts';
import { createNotifyHandler, type NotifyDeps } from './notify/index.ts';
import type { JobHandler, SqlClient } from './queue.ts';

/**
 * Handler registry of worker-node (shared file, orchestrator). Module owners provide the handler factories:
 * notify.send and account.purge (kimlik, src/notify, src/account), billing.monthly_grant and billing.reconcile (odeme, src/billing),
 * kalemcik.daily (yazma, src/kalemcik).
 */
export interface HandlerDeps {
  notify?: NotifyDeps;
  billing?: BillingJobsDeps;
  purge?: PurgeDeps;
  kalemcik?: GunlukBagimliliklar;
}

export function buildHandlers(d: HandlerDeps): Partial<Record<JobType, JobHandler>> {
  return {
    ...(d.notify ? { 'notify.send': createNotifyHandler(d.notify) } : {}),
    ...(d.billing ? billingHandlers(d.billing) : {}),
    ...(d.purge ? { 'account.purge': createPurgeHandler(d.purge) } : {}),
    ...(d.kalemcik ? { 'kalemcik.daily': createKalemcikDailyHandler(d.kalemcik) } : {}),
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
 * Daily billing schedule (plan 9.2/3 and 9.2/5): once a day per job type, keyed <type>:<UTC day>. The payload is
 * checked against the contract and the key is enqueued once in any state (ADR-0035, enqueueOnceSql), so a restart
 * or a second deployment on the same day does not queue a finished day again. The in-process day only saves the
 * round trip; it is no longer the guard.
 */
export function dailyBillingTick(db: SqlClient, now: () => Date = () => new Date()): () => Promise<void> {
  let last = '';
  return async () => {
    const today = day(now());
    if (today === last) return;
    const yesterday = day(new Date(now().getTime() - 86_400_000));
    await enqueueJob(
      db,
      'billing.monthly_grant',
      {},
      { once: true, dedupeKey: `billing.monthly_grant:${today}` },
    );
    await enqueueJob(
      db,
      'billing.reconcile',
      { day: yesterday },
      { once: true, dedupeKey: `billing.reconcile:${today}` },
    );
    last = today;
  };
}
