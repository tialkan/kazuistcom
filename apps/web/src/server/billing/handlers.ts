/**
 * Framework neutral handlers for the billing and wallet endpoints (contracts v1). Route files under
 * apps/web/src/app/api/v1 call these once auth (kimlik) provides the session user.
 */
import {
  CancelSubscriptionInput,
  CheckoutSubscriptionInput,
  CheckoutTopupInput,
  RefundRequestInput,
} from '@kazuist/contracts';
import { toPublicPriceTable } from '@kazuist/ledger';
import { BillingError, type BillingService, type Buyer } from './service.ts';

export interface HandlerCtx {
  service: BillingService;
  /** Session user id or null (401). */
  userId: string | null;
  /** Buyer details for iyzico, loaded server side from the profile. */
  buyer?: Buyer;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const problem = (status: number, code: string) =>
  Response.json(
    { type: 'about:blank', title: code, status, code },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BillingError) return problem(e.status, e.code);
    throw e;
  }
}

function idemKey(req: Request): string | null {
  const k = req.headers.get('Idempotency-Key');
  return k && /^[A-Za-z0-9_-]{8,128}$/.test(k) ? k : null;
}

export const getPrices = (ctx: HandlerCtx) => json(toPublicPriceTable(ctx.service.prices()));

export async function getWallet(ctx: HandlerCtx) {
  if (!ctx.userId) return problem(401, 'unauthorized');
  return json(await ctx.service.wallet(ctx.userId));
}

export async function getWalletLedger(ctx: HandlerCtx) {
  if (!ctx.userId) return problem(401, 'unauthorized');
  return json(await ctx.service.movements(ctx.userId));
}

export function checkoutTopup(req: Request, ctx: HandlerCtx) {
  return guard(async () => {
    if (!ctx.userId || !ctx.buyer) return problem(401, 'unauthorized');
    const key = idemKey(req);
    if (!key) return problem(400, 'idempotency_key_required');
    const parsed = CheckoutTopupInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return problem(400, 'invalid_body');
    return json(await ctx.service.startTopup(ctx.userId, key, parsed.data, ctx.buyer), 201);
  });
}

export function checkoutSubscription(req: Request, ctx: HandlerCtx) {
  return guard(async () => {
    if (!ctx.userId || !ctx.buyer) return problem(401, 'unauthorized');
    const key = idemKey(req);
    if (!key) return problem(400, 'idempotency_key_required');
    const parsed = CheckoutSubscriptionInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return problem(400, 'invalid_body');
    return json(await ctx.service.startSubscription(ctx.userId, key, parsed.data, ctx.buyer), 201);
  });
}

export function cancelSubscription(req: Request, ctx: HandlerCtx, id: string) {
  return guard(async () => {
    if (!ctx.userId) return problem(401, 'unauthorized');
    const parsed = CancelSubscriptionInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return problem(400, 'invalid_body');
    return json(await ctx.service.cancel(ctx.userId, id, parsed.data.mode));
  });
}

export function createRefundRequest(req: Request, ctx: HandlerCtx) {
  return guard(async () => {
    if (!ctx.userId) return problem(401, 'unauthorized');
    const parsed = RefundRequestInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return problem(400, 'invalid_body');
    const r = await ctx.service.refundPackage(ctx.userId, parsed.data.orderId);
    return json({ id: parsed.data.orderId, ...r }, 201);
  });
}

export function iyzicoWebhook(req: Request, ctx: HandlerCtx) {
  return guard(async () => {
    const raw = await req.text();
    const r = await ctx.service.handleWebhook(raw, req.headers.get('X-IYZ-SIGNATURE-V3'));
    return r.status === 200
      ? json({ ok: true, duplicate: r.duplicate ?? false })
      : problem(r.status, 'webhook_rejected');
  });
}
