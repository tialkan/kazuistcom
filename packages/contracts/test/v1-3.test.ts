import { describe, expect, it } from 'vitest';
import { MeDeleteInput, OrderLegalDocument } from '../src/index.ts';
describe('contract v1.3', () => {
  it('defaults the deletion refund choice to true and accepts explicit false without accepting extras', () => {
    expect(MeDeleteInput.parse({})).toEqual({ requestRefund: true });
    expect(MeDeleteInput.parse({ requestRefund: false })).toEqual({ requestRefund: false });
    expect(MeDeleteInput.safeParse({ requestRefund: 'false' }).success).toBe(false);
    expect(MeDeleteInput.safeParse({ extra: true }).success).toBe(false);
  });
  it('returns owner documents without internal fields or buyer metadata', () => {
    const d = { slug: 'abonelik', version: '2026-10-25.1', text: 'Örnek', sha256: 'a'.repeat(64) };
    expect(OrderLegalDocument.safeParse(d).success).toBe(true);
    expect(OrderLegalDocument.safeParse({ ...d, fields: { ALICI_AD: 'Test' } }).success).toBe(false);
  });
});
