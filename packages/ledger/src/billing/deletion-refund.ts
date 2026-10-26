/** Approved account-deletion policy: original payment, unused package share, ceil, remaining paid cap. */
export function deletionRefundLimit(input: {
  originalPaidKurus: number;
  originalCredits: number;
  unusedCredits: number;
  priorRefundExposureKurus: number;
}): number {
  const { originalPaidKurus, originalCredits, unusedCredits, priorRefundExposureKurus } = input;
  if (
    !Object.values(input).every(Number.isSafeInteger) ||
    originalPaidKurus <= 0 ||
    originalCredits <= 0 ||
    unusedCredits < 0 ||
    unusedCredits > originalCredits ||
    priorRefundExposureKurus < 0
  )
    throw new Error('invalid_deletion_refund_allocation');
  const numerator = BigInt(originalPaidKurus) * BigInt(unusedCredits);
  const proportional = (numerator + BigInt(originalCredits) - 1n) / BigInt(originalCredits);
  const remaining = Math.max(0, originalPaidKurus - priorRefundExposureKurus);
  return Number(proportional < BigInt(remaining) ? proportional : BigInt(remaining));
}
