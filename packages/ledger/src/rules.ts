/** Billing rules of plan 4.5, pure functions over dates and amounts (kurus). */
const DAY_MS = 86_400_000;

export const PACKAGE_REFUND_DAYS = 14;
export const RENEWAL_NOTICE_DAYS = 7;
export const ANNUAL_RENEWAL_NOTICE_DAYS = 30;
export const PRICE_CHANGE_NOTICE_DAYS = 30;
/** Failed charge retries on day 1, 3 and 7 after the first failure; then the plan drops to Ucretsiz. */
export const RETRY_DAYS = [1, 3, 7] as const;
export const ANNUAL_REFUND_DAYS = 15;

export type Interval = 'aylik' | 'yillik';

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Calendar month addition in UTC, clamped to the last day of the target month. */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target;
}

/** 4.5/4: full refund within 14 days of purchase when no credit of the package was used. */
export function packageRefundAllowed(p: {
  purchasedAt: Date;
  now: Date;
  originalCredits: number;
  remainingCredits: number;
}): boolean {
  const within = p.now.getTime() - p.purchasedAt.getTime() <= PACKAGE_REFUND_DAYS * DAY_MS;
  return within && p.remainingCredits === p.originalCredits;
}

/**
 * 4.5/7: annual plan refund on immediate cancellation:
 * refund = paid annual price - (months already granted x monthly list price), never below zero.
 */
export function annualRefundKurus(p: {
  paidKurus: number;
  grantedMonths: number;
  monthlyListKurus: number;
}): number {
  return Math.max(0, p.paidKurus - p.grantedMonths * p.monthlyListKurus);
}

export interface SubscriptionView {
  interval: Interval;
  status: 'deneme' | 'aktif' | 'odeme_bekliyor' | 'iptal' | 'sona_erdi';
  paidKurus: number;
  monthlyListKurus: number;
  grantsDelivered: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface CancelDecision {
  status: SubscriptionView['status'];
  cancelAtPeriodEnd: boolean;
  endsAt: Date;
  refundAmountKurus: number;
  refundDueBy: Date | null;
}

/** 4.5/6-7: one step cancellation. Default donem_sonu; hemen ends now (monthly: no refund, credits stay). */
export function decideCancel(sub: SubscriptionView, mode: 'donem_sonu' | 'hemen', now: Date): CancelDecision {
  if (mode === 'donem_sonu') {
    return {
      status: sub.status,
      cancelAtPeriodEnd: true,
      endsAt: sub.currentPeriodEnd,
      refundAmountKurus: 0,
      refundDueBy: null,
    };
  }
  const refund =
    sub.interval === 'yillik'
      ? annualRefundKurus({
          paidKurus: sub.paidKurus,
          grantedMonths: sub.grantsDelivered,
          monthlyListKurus: sub.monthlyListKurus,
        })
      : 0;
  return {
    status: 'iptal',
    cancelAtPeriodEnd: false,
    endsAt: now,
    refundAmountKurus: refund,
    refundDueBy: refund > 0 ? addDays(now, ANNUAL_REFUND_DAYS) : null,
  };
}

export interface ScheduledNotice {
  kind: 'odeme_7_gun' | 'yillik_30_gun' | 'fiyat_degisikligi';
  sendAt: Date;
}

/** 4.5/8: a notice at least 7 days before every automatic charge, plus 30 days before an annual renewal. */
export function renewalNotices(nextChargeAt: Date, interval: Interval): ScheduledNotice[] {
  const out: ScheduledNotice[] = [
    { kind: 'odeme_7_gun', sendAt: addDays(nextChargeAt, -RENEWAL_NOTICE_DAYS) },
  ];
  if (interval === 'yillik')
    out.unshift({ kind: 'yillik_30_gun', sendAt: addDays(nextChargeAt, -ANNUAL_RENEWAL_NOTICE_DAYS) });
  return out;
}

/**
 * 4.5/9: a new price applies from the first period that starts at least 30 days after the notice.
 * Returns the date of that period start.
 */
export function priceChangeEffectiveAt(p: {
  noticeSentAt: Date;
  nextPeriodStarts: readonly Date[];
}): Date | null {
  const earliest = addDays(p.noticeSentAt, PRICE_CHANGE_NOTICE_DAYS).getTime();
  return p.nextPeriodStarts.find((d) => d.getTime() >= earliest) ?? null;
}

export type DunningStep = { action: 'retry'; at: Date; attempt: number } | { action: 'downgrade'; at: Date };

/** 4.5/10: after a failed charge retry on day 1, 3 and 7; when the third retry fails, drop to Ucretsiz. */
export function dunningPlan(firstFailureAt: Date): DunningStep[] {
  const steps: DunningStep[] = RETRY_DAYS.map((d, i) => ({
    action: 'retry' as const,
    at: addDays(firstFailureAt, d),
    attempt: i + 1,
  }));
  steps.push({
    action: 'downgrade',
    at: addDays(firstFailureAt, RETRY_DAYS[RETRY_DAYS.length - 1] as number),
  });
  return steps;
}

/** Next dunning action given how many retries already failed. */
export function nextDunningStep(firstFailureAt: Date, failedRetries: number): DunningStep {
  const plan = dunningPlan(firstFailureAt);
  return failedRetries >= RETRY_DAYS.length
    ? (plan[plan.length - 1] as DunningStep)
    : (plan[failedRetries] as DunningStep);
}

/**
 * Monthly credit grants of an annual plan (9.2/3): month k (0 based) is due at start + k months.
 * Returns how many grants are due by `now`, capped at 12.
 */
export function annualGrantsDue(periodStart: Date, now: Date): number {
  let n = 0;
  while (n < 12 && addMonths(periodStart, n).getTime() <= now.getTime()) n++;
  return n;
}

/** Calendar day in Europe/Istanbul (UTC+3 all year since 2016), YYYY-MM-DD. */
export function istanbulDay(d: Date): string {
  return new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Day based due check for the daily billing job (D1): a step planned for day N after the failure runs on
 * that calendar day whatever the hour of the tick, so retries land on day 1, 3 and 7, not 2, 4 and 8.
 */
export function dueToday(at: Date, now: Date): boolean {
  return istanbulDay(at) <= istanbulDay(now);
}
