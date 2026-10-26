import { describe, expect, it } from 'vitest';
import {
  AdminRefundRequestDecisionInput,
  AdminRefundRequestExecuteInput,
  AdminRefundRequestItemResolveInput,
  RefundRequestReviewDetail,
} from '../src/index.ts';
describe('contract v1.4 deletion refund review', () => {
  it('requires a reason and forbids caller supplied actors or amounts', () => {
    const base = { decision: 'onay', reason: 'Hak yeniden ölçüldü ve onaylandı' };
    expect(AdminRefundRequestDecisionInput.safeParse(base).success).toBe(true);
    expect(AdminRefundRequestDecisionInput.safeParse({ ...base, reason: '   ' }).success).toBe(false);
    expect(AdminRefundRequestDecisionInput.safeParse({ ...base, actorId: 'x' }).success).toBe(false);
    expect(AdminRefundRequestDecisionInput.safeParse({ ...base, amountKurus: 999 }).success).toBe(false);
    expect(AdminRefundRequestDecisionInput.safeParse({ ...base, decision: 'tamamlandi' }).success).toBe(
      false,
    );
  });
  it('execute cannot change an immutable allocation and resolve cannot supply another status', () => {
    expect(AdminRefundRequestExecuteInput.safeParse({}).success).toBe(true);
    expect(AdminRefundRequestExecuteInput.safeParse({ amountKurus: 1 }).success).toBe(false);
    const base = {
      outcome: 'basarili',
      reason: 'Panelde işlem başarılı görünüyor',
      providerResultRef: 'verified-ref',
    };
    expect(AdminRefundRequestItemResolveInput.safeParse(base).success).toBe(true);
    expect(AdminRefundRequestItemResolveInput.safeParse({ ...base, outcome: 'bekliyor' }).success).toBe(
      false,
    );
    expect(AdminRefundRequestItemResolveInput.safeParse({ ...base, providerResultRef: '' }).success).toBe(
      false,
    );
  });
  it('exposes no raw provider or legal content in a review response', () => {
    const base = {
      id: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      status: 'bekliyor',
      amountKurus: null,
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
      createdAt: '2026-10-27T00:00:00Z',
      items: [],
      candidates: [],
    };
    expect(RefundRequestReviewDetail.safeParse(base).success).toBe(true);
    expect(RefundRequestReviewDetail.safeParse({ ...base, raw: { buyer: 'test' } }).success).toBe(false);
  });
});
