/**
 * Billing and wallet endpoints (contracts v1.1). Signed in routes go through kimlik's withAuth (session or
 * bearer, origin check, rate limit); prices and the iyzico webhook are public. Errors use the contract
 * Error body (apiError).
 */
import {
  CancelSubscriptionInput,
  CheckoutSubscriptionInput,
  CheckoutTopupInput,
  RefundRequestInput,
  type ErrorCode,
} from '@kazuist/contracts';
import { toPublicPriceTable } from '@kazuist/ledger';
import { withAuth, withPublic, type Principal } from '../auth/guard.ts';
import { apiError, json } from '../auth/http.ts';
import { clientIp } from '../auth/rate-limit.ts';
import { schema } from '../auth/db.ts';
import { eq } from '../auth/orm.ts';
import type { AuthContext } from '../auth/context.ts';
import { BillingUnavailable, getBillingService } from './context.ts';
import { BillingError, type BillingService, type Buyer } from '@kazuist/ledger/billing';

const rate = {
  read: { name: 'billing-read', limit: 120, windowSec: 60 },
  write: { name: 'billing-write', limit: 10, windowSec: 60 },
  prices: { name: 'billing-prices', limit: 120, windowSec: 60 },
  webhook: { name: 'billing-webhook', limit: 600, windowSec: 60 },
};

const codeOf: Record<BillingError['status'], ErrorCode> = {
  400: 'bad_request',
  401: 'unauthorized',
  402: 'bad_request',
  404: 'not_found',
  409: 'conflict',
};

/** Run with the billing service; BillingError and an unconfigured service map to contract errors. */
export async function withService(fn: (s: BillingService) => Promise<Response>): Promise<Response> {
  let s: BillingService;
  try {
    s = await getBillingService();
  } catch (e) {
    if (e instanceof BillingUnavailable) return apiError('unavailable');
    throw e;
  }
  try {
    return await fn(s);
  } catch (e) {
    if (e instanceof BillingError) return apiError(codeOf[e.status]);
    throw e;
  }
}

function idemKey(req: Request): string | null {
  const k = req.headers.get('Idempotency-Key');
  return k && /^[A-Za-z0-9_-]{8,128}$/.test(k) ? k : null;
}

/**
 * Buyer fields iyzico requires. Kazuist does not collect a national id or address; iyzico's documented
 * placeholders are sent until the product decision (DEVIR, Tarik).
 */
async function buyerOf(req: Request, p: Principal, ctx: AuthContext): Promise<Buyer> {
  const [u] = await ctx.db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, p.userId));
  const parts = (u?.name ?? '').trim().split(/\s+/).filter(Boolean);
  const surname = parts.length > 1 ? (parts.pop() as string) : 'Kazuist';
  return {
    id: p.userId,
    email: p.email,
    name: parts.join(' ') || 'Kazuist',
    surname,
    identityNumber: '11111111111',
    ip: clientIp(req.headers, ctx.config.trustedProxies),
    city: 'Ankara',
    country: 'Turkey',
    address: 'Turkey',
  };
}

async function body(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}

export const pricesGet = withPublic(rate.prices, async () =>
  withService(async (s) =>
    json(toPublicPriceTable(s.prices()), 200, { 'Cache-Control': 'public, max-age=300' }),
  ),
);

export const walletGet = withAuth({ rate: rate.read }, async (_req, p) =>
  withService(async (s) => json(await s.wallet(p.userId))),
);

export const walletLedgerGet = withAuth({ rate: rate.read }, async (_req, p) =>
  withService(async (s) => json(await s.movements(p.userId))),
);

export const invoicesGet = withAuth({ rate: rate.read }, async (_req, p) =>
  withService(async (s) => json(await s.invoices(p.userId))),
);

export const checkoutTopupPost = withAuth({ rate: rate.write }, async (req, p, ctx) =>
  withService(async (s) => {
    const key = idemKey(req);
    if (!key) return apiError('bad_request');
    const parsed = CheckoutTopupInput.safeParse(await body(req));
    if (!parsed.success) return apiError('bad_request');
    return json(await s.startTopup(p.userId, key, parsed.data, await buyerOf(req, p, ctx)), 201);
  }),
);

export const checkoutSubscriptionPost = withAuth({ rate: rate.write }, async (req, p, ctx) =>
  withService(async (s) => {
    const key = idemKey(req);
    if (!key) return apiError('bad_request');
    const parsed = CheckoutSubscriptionInput.safeParse(await body(req));
    if (!parsed.success) return apiError('bad_request');
    return json(await s.startSubscription(p.userId, key, parsed.data, await buyerOf(req, p, ctx)), 201);
  }),
);

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function subscriptionCancelPost(req: Request, route: { params: Promise<{ id: string }> }) {
  return withAuth({ rate: rate.write }, async (r, p) =>
    withService(async (s) => {
      const { id } = await route.params;
      if (!uuidRe.test(id)) return apiError('not_found');
      const parsed = CancelSubscriptionInput.safeParse(await body(r));
      if (!parsed.success) return apiError('bad_request');
      return json(await s.cancel(p.userId, id, parsed.data.mode));
    }),
  )(req);
}

export const refundRequestPost = withAuth({ rate: rate.write }, async (req, p) =>
  withService(async (s) => {
    const parsed = RefundRequestInput.safeParse(await body(req));
    if (!parsed.success) return apiError('bad_request');
    const r = await s.refundPackage(p.userId, parsed.data.orderId);
    return json({ id: parsed.data.orderId, ...r }, 201);
  }),
);

/** Public: authenticated by the iyzico signature, idempotent on iyziReferenceCode. */
export const iyzicoWebhookPost = withPublic(rate.webhook, async (req) =>
  withService((s) => iyzicoWebhook(req, s)),
);

export async function iyzicoWebhook(req: Request, s: BillingService): Promise<Response> {
  const raw = await req.text();
  if (raw.length > 64_000) return apiError('payload_too_large');
  const r = await s.handleWebhook(raw, req.headers.get('X-IYZ-SIGNATURE-V3'));
  if (r.status === 200) return json({ ok: true, duplicate: r.duplicate ?? false });
  return apiError(r.status === 401 ? 'unauthorized' : 'bad_request');
}

async function tokenFrom(req: Request): Promise<string | null> {
  const form = await req.formData().catch(() => null);
  const t = form?.get('token');
  return typeof t === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(t) ? t : null;
}

const result = (base: string, ok: boolean) =>
  Response.redirect(`${base}/odeme/donus?durum=${ok ? 'basarili' : 'basarisiz'}`, 303);

/**
 * iyzico posts the checkout token to the callback URL. The token is re-queried server side; the browser
 * is redirected to the result page with only an outcome flag, never payment data.
 */
export const checkoutCallbackPost = withPublic(rate.webhook, async (req, ctx) =>
  withService(async (s) => {
    const token = await tokenFrom(req);
    if (!token) return result(ctx.config.baseUrl, false);
    const order = await s.completeCheckout(token);
    return result(ctx.config.baseUrl, order.status === 'odendi');
  }),
);

export const subscriptionCallbackPost = withPublic(rate.webhook, async (req, ctx) =>
  withService(async (s) => {
    const token = await tokenFrom(req);
    if (!token) return result(ctx.config.baseUrl, false);
    try {
      await s.completeSubscriptionCheckout(token);
      return result(ctx.config.baseUrl, true);
    } catch (e) {
      if (e instanceof BillingError) return result(ctx.config.baseUrl, false);
      throw e;
    }
  }),
);
