import { z } from 'zod';

/**
 * Billing vocabulary shared by the API (openapi.yaml), packages/db CHECK constraints and the worker
 * (contract v1.2, ADR-0026). Tests keep each list equal to its OpenAPI enum or SQL constraint.
 */

/** payments.status (odeme, re-audit 2026-10-22). hazir: stored before the provider call (refunds). */
export const paymentStatuses = ['hazir', 'bekliyor', 'basarili', 'basarisiz'] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

/**
 * Billing notice kinds (notices.kind and NotifyPayload.subtype). Preferences stay per notification type:
 * all of these are delivered as type `odeme` (mandatory e-mail), fesih_teyidi keeps its own type.
 */
export const billingNoticeKinds = [
  'odeme_7_gun',
  'yillik_30_gun',
  'odeme_alindi',
  'odeme_basarisiz',
  'plan_ucretsize_indi',
  'fiyat_degisikligi',
  'sozlesme',
] as const;
export const BillingNoticeKind = z.enum(billingNoticeKinds);
export type BillingNoticeKind = z.infer<typeof BillingNoticeKind>;

/** notices.kind: the billing notice kinds plus the cancellation confirmation (Abonelik Yon. m.25). */
export const noticeKinds = [...billingNoticeKinds, 'fesih_teyidi'] as const;

export const planCodes = [
  'ogrenci.aylik',
  'ogrenci.yillik',
  'akademisyen.aylik',
  'akademisyen.yillik',
] as const;
export const PlanCode = z.enum(planCodes);

/** refund_requests.status as seen by the client. */
export const refundRequestStatuses = ['bekliyor', 'tamamlandi'] as const;

/** POST /v1/refund-requests: 201 when refunded at once, 202 when it waits for an administrator. */
export const RefundRequestResult = z.object({
  id: z.uuid(),
  status: z.enum(refundRequestStatuses),
  amountKurus: z.number().int().nullable(),
});
export type RefundRequestResult = z.infer<typeof RefundRequestResult>;

/** POST /v1/subscriptions/{id}/cancel result. */
export const CancelSubscriptionResult = z.object({
  status: z.string(),
  refundAmountKurus: z.number().int().optional(),
});

/** Refund references (payments.refund_ref): fesih:<subscription>, paket:<order>, abonelik:<subscription>. */
export const refundRefPattern = /^[a-z_]{1,30}:[0-9a-f-]{36}$/;
