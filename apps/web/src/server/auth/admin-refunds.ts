import { AdminRefundResolveInput, refundRefPattern } from '@kazuist/contracts';
import { withService } from '../billing/handlers.ts';
import { withAuth } from './guard.ts';
import { apiError, json, noStore, readJson } from './http.ts';

export const adminPendingRefundsGet = withAuth(
  { admin: true, rate: { name: 'admin-refunds-read', limit: 60, windowSec: 60 } },
  async () => withService(async (service) => json(await service.listPendingRefunds())),
);

export const adminRefundResolvePost = withAuth(
  { admin: true, rate: { name: 'admin-refunds-write', limit: 20, windowSec: 60 } },
  async (req, principal, _ctx, params) => {
    const ref = params.refundRef;
    const input = AdminRefundResolveInput.safeParse(await readJson(req));
    if (!ref || !refundRefPattern.test(ref) || !input.success) return apiError('bad_request');
    return withService(async (service) => {
      await service.resolvePendingRefund(ref, input.data.outcome, principal.userId);
      return new Response(null, { status: 204, headers: noStore });
    });
  },
);
