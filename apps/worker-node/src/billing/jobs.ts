/**
 * Billing jobs (plan 9.2/3, 9.2/5): billing.monthly_grant and billing.reconcile. The handlers are
 * idempotent: grants use ledger idempotency keys and reconciliation only reads and reports.
 * Registration in src/main.ts is done by the orchestrator (shared file).
 */
import type { ReconcileResult } from '@kazuist/ledger/billing';
import type { JobHandler } from '../queue.ts';

export interface BillingJobsDeps {
  monthlyGrant(): Promise<{ granted: number; failed: string[] }>;
  reconcileDay(day: Date): Promise<ReconcileResult>;
  now(): Date;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Day to reconcile: payload.day (YYYY-MM-DD, UTC) or yesterday. */
export function reconcileDayOf(payload: unknown, now: Date): Date {
  const day = (payload as { day?: unknown } | null)?.day;
  if (typeof day === 'string' && DAY.test(day)) return new Date(`${day}T00:00:00Z`);
  const y = new Date(now.getTime() - 86_400_000);
  return new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate()));
}

export function billingHandlers(
  deps: BillingJobsDeps,
): Record<'billing.monthly_grant' | 'billing.reconcile', JobHandler> {
  return {
    'billing.monthly_grant': async () => deps.monthlyGrant(),
    'billing.reconcile': async (job) => {
      const day = reconcileDayOf(job.payload, deps.now());
      const { disabled, diffs } = await deps.reconcileDay(day);
      // Only ids and counts leave the job; no personal data. disabled: no report call, alert raised (O8).
      return {
        day: day.toISOString().slice(0, 10),
        disabled,
        differences: diffs.length,
        paymentIds: diffs.map((d) => d.paymentId),
      };
    },
  };
}

/** Enqueue one job per type and day; the partial unique index on (type, dedupe_key) drops repeats. */
export const enqueueDailyBillingSql = `
INSERT INTO jobs (type, payload, dedupe_key)
VALUES ($1::job_type, $2::jsonb, $1 || ':' || $3)
ON CONFLICT DO NOTHING`;
