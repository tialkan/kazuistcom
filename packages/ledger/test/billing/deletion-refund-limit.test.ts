import { expect, it } from 'vitest';
import { deletionRefundLimit } from '../../src/billing/deletion-refund.ts';
it('uses the discounted original payment instead of the current catalog and rounds in the consumer favor', () => {
  expect(
    deletionRefundLimit({
      originalPaidKurus: 1950,
      originalCredits: 300,
      unusedCredits: 200,
      priorRefundExposureKurus: 0,
    }),
  ).toBe(1300);
  expect(
    deletionRefundLimit({
      originalPaidKurus: 10,
      originalCredits: 3,
      unusedCredits: 1,
      priorRefundExposureKurus: 0,
    }),
  ).toBe(4);
});
it('caps the proportional refund at the remaining paid balance, including an unknown prior refund', () => {
  expect(
    deletionRefundLimit({
      originalPaidKurus: 10,
      originalCredits: 3,
      unusedCredits: 1,
      priorRefundExposureKurus: 7,
    }),
  ).toBe(3);
  expect(
    deletionRefundLimit({
      originalPaidKurus: 10,
      originalCredits: 3,
      unusedCredits: 3,
      priorRefundExposureKurus: 15,
    }),
  ).toBe(0);
});
it('keeps exact integer arithmetic for the largest permitted persisted amounts and credits', () => {
  expect(
    deletionRefundLimit({
      originalPaidKurus: 2147483647,
      originalCredits: 2147483647,
      unusedCredits: 2147483646,
      priorRefundExposureKurus: 0,
    }),
  ).toBe(2147483646);
});
