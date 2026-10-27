import { adminRefundRequestMutation } from '@/server/billing/handlers';
export const dynamic = 'force-dynamic';
export function POST(req: Request, route: { params: Promise<{ requestId: string; itemId?: string }> }) {
  return adminRefundRequestMutation('resolve', req, route);
}
