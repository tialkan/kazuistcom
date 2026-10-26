import { z } from 'zod';
import { paymentStatuses } from './billing.ts';

/** ADR-0028 proposal. Deletion refund requests are distinct from unknown provider refund outcomes. */
export const refundReviewStatuses = ['bekliyor', 'onaylandi', 'reddedildi', 'tamamlandi'] as const;
export const RefundReviewStatus = z.enum(refundReviewStatuses);
export const RefundRequestItemState = z.enum(paymentStatuses);
const reason = z.string().trim().min(10).max(2000);
export const AdminRefundRequestDecisionInput = z.strictObject({ decision: z.enum(['onay', 'ret']), reason });
export const AdminRefundRequestExecuteInput = z.strictObject({});
export const AdminRefundRequestItemResolveInput = z.strictObject({
  outcome: z.enum(['basarili', 'basarisiz']),
  reason,
  providerResultRef: z.string().trim().min(1).max(200).optional(),
});
const amount = z.number().int().nonnegative();
export const RefundRequestItem = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  originalPaidKurus: amount,
  originalCredits: z.number().int().positive(),
  unusedCredits: z.number().int().positive(),
  approvedAmountKurus: amount,
  providerRefundRef: z.string(),
  state: RefundRequestItemState,
  providerResultRef: z.string().nullable(),
  resolvedBy: z.uuid().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  resolutionReason: z.string().nullable(),
  updatedBy: z.uuid(),
  stateReason: z.string(),
});
export const RefundRequestCandidate = z.strictObject({
  orderId: z.uuid(),
  originalPaidKurus: amount,
  originalCredits: z.number().int().positive(),
  unusedCredits: z.number().int().nonnegative(),
  priorRefundExposureKurus: amount,
  maxRefundKurus: amount,
  hasOpenReservation: z.boolean(),
});
export const RefundRequestReview = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  status: RefundReviewStatus,
  amountKurus: amount.nullable(),
  decisionReason: z.string().nullable(),
  decidedBy: z.uuid().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  items: z.array(RefundRequestItem),
});
export const RefundRequestReviewDetail = RefundRequestReview.extend({
  candidates: z.array(RefundRequestCandidate),
});
export type RefundRequestReview = z.infer<typeof RefundRequestReview>;
export type RefundRequestItem = z.infer<typeof RefundRequestItem>;
