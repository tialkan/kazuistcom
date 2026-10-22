/**
 * iyzico client (sandbox only in Wave 1). Verified against docs.iyzico.com on 2026-10-19:
 * - Auth: Authorization "IYZWSv2 " + base64("apiKey:<k>&randomKey:<r>&signature:<hex>"),
 *   signature = HMAC-SHA256(secretKey, randomKey + uri.path + body) in hex; random key in x-iyzi-rnd.
 * - Checkout Form: POST /payment/iyzipos/checkoutform/initialize/auth/ecom, result by
 *   POST /payment/iyzipos/checkoutform/auth/ecom/detail with the token (server side re-query).
 * - Subscription: /v2/subscription/products, /v2/subscription/products/{ref}/pricing-plans,
 *   /v2/subscription/checkoutform/initialize, /v2/subscription/subscriptions/{ref}(/cancel),
 *   /v2/subscription/operation/retry, /v2/subscription/orders/{ref}.
 * - Refund: POST /v2/payment/refund (full or partial over paymentId).
 * - Webhook: header X-IYZ-SIGNATURE-V3, HMAC-SHA256 hex with the secret key over
 *   HPP: secretKey + iyziEventType + iyziPaymentId + token + paymentConversationId + status
 *   Subscription: merchantId + secretKey + iyziEventType + subscriptionReferenceCode + orderReferenceCode
 *   + customerReferenceCode. Events: subscription.order.success, subscription.order.failure.
 * Card data never reaches Kazuist: the form is hosted by iyzico.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const IYZICO_SANDBOX_BASE_URL = 'https://sandbox-api.iyzipay.com';

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  merchantId?: string;
  baseUrl: string;
}

/** Reject anything that is not the sandbox host in Wave 1 (live keys need Tarik's approval). */
export function assertSandbox(cfg: IyzicoConfig): void {
  if (new URL(cfg.baseUrl).host !== 'sandbox-api.iyzipay.com')
    throw new Error('iyzico: only sandbox is allowed');
}

export function authorizationHeader(
  cfg: Pick<IyzicoConfig, 'apiKey' | 'secretKey'>,
  path: string,
  body: string,
  randomKey: string,
): string {
  const signature = createHmac('sha256', cfg.secretKey)
    .update(randomKey + path + body)
    .digest('hex');
  const auth = `apiKey:${cfg.apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return `IYZWSv2 ${Buffer.from(auth).toString('base64')}`;
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface HppWebhook {
  iyziEventType: string;
  iyziPaymentId: number | string;
  token: string;
  paymentConversationId: string;
  status: string;
  iyziReferenceCode: string;
  merchantId?: string;
  iyziEventTime?: number;
}
export interface SubscriptionWebhook {
  iyziEventType: 'subscription.order.success' | 'subscription.order.failure';
  subscriptionReferenceCode: string;
  orderReferenceCode: string;
  customerReferenceCode: string;
  iyziReferenceCode: string;
  iyziEventTime?: number;
}
export type IyzicoWebhook = HppWebhook | SubscriptionWebhook;

export function isSubscriptionWebhook(w: IyzicoWebhook): w is SubscriptionWebhook {
  return 'subscriptionReferenceCode' in w;
}

export function webhookSignature(
  cfg: Pick<IyzicoConfig, 'secretKey' | 'merchantId'>,
  w: IyzicoWebhook,
): string {
  const data = isSubscriptionWebhook(w)
    ? `${cfg.merchantId ?? ''}${cfg.secretKey}${w.iyziEventType}${w.subscriptionReferenceCode}${w.orderReferenceCode}${w.customerReferenceCode}`
    : `${cfg.secretKey}${w.iyziEventType}${w.iyziPaymentId}${w.token}${w.paymentConversationId}${w.status}`;
  return createHmac('sha256', cfg.secretKey).update(data).digest('hex');
}

export function verifyWebhookSignature(
  cfg: Pick<IyzicoConfig, 'secretKey' | 'merchantId'>,
  w: IyzicoWebhook,
  header: string | null,
): boolean {
  if (!header) return false;
  return safeEqualHex(webhookSignature(cfg, w), header.trim().toLowerCase());
}

/* Provider facing API used by the billing service; HttpIyzico implements it, FakeIyzico mirrors sandbox. */

export interface CheckoutInit {
  conversationId: string;
  basketId: string;
  priceKurus: number;
  paidPriceKurus: number;
  callbackUrl: string;
  buyer: {
    id: string;
    email: string;
    name: string;
    surname: string;
    identityNumber: string;
    ip: string;
    city: string;
    country: string;
    address: string;
  };
  item: { id: string; name: string; category: string };
}
export interface CheckoutInitResult {
  token: string;
  checkoutFormContent: string;
  paymentPageUrl: string | null;
}
export interface CheckoutResult {
  status: 'success' | 'failure';
  paymentStatus: 'SUCCESS' | 'FAILURE' | 'INIT_THREEDS' | 'CALLBACK_THREEDS' | string;
  paymentId: string | null;
  basketId: string | null;
  conversationId: string | null;
  paidPriceKurus: number | null;
  /** 1 approved, 0 in review (wait for the notification), -1 rejected. */
  fraudStatus: number | null;
  currency: string | null;
}
export interface SubscriptionInit {
  conversationId: string;
  pricingPlanReferenceCode: string;
  callbackUrl: string;
  customer: CheckoutInit['buyer'];
}
export interface SubscriptionDetail {
  referenceCode: string;
  status: 'ACTIVE' | 'PENDING' | 'UNPAID' | 'UPGRADED' | 'CANCELED' | 'EXPIRED' | string;
  pricingPlanReferenceCode: string;
  startDate: number | null;
  endDate: number | null;
  orders: SubscriptionOrder[];
}
/** docs.iyzico.com subscription detail: orders[] carry orderStatus and paymentAttempts[]. */
export interface SubscriptionOrder {
  referenceCode: string;
  /** Kurus. */
  price: number;
  currencyCode: string;
  startPeriod: number;
  endPeriod: number;
  orderStatus: 'WAITING' | 'SUCCESS' | 'FAILED' | string;
  paymentAttempts: {
    paymentStatus: 'SUCCESS' | 'FAILED' | string;
    paymentId: string | null;
    createdDate: number;
  }[];
}

/** Payment id of the successful attempt of an order, or null. */
export function successfulPaymentId(o: SubscriptionOrder | undefined): string | null {
  if (!o || o.orderStatus !== 'SUCCESS') return null;
  const ok = o.paymentAttempts.filter((a) => a.paymentStatus === 'SUCCESS' && a.paymentId);
  return ok.length ? (ok[ok.length - 1]?.paymentId ?? null) : null;
}

/**
 * definite: iyzico answered with status failure (nothing happened). Otherwise the outcome is unknown
 * (network error, timeout, unreadable answer) and the call must not be repeated blindly.
 */
export class IyzicoError extends Error {
  constructor(
    readonly path: string,
    readonly definite: boolean,
    readonly errorCode: string | null = null,
  ) {
    super(`iyzico ${path} failed`);
    this.name = 'IyzicoError';
  }
}
export interface RefundResult {
  status: 'success' | 'failure';
  paymentId: string;
  priceKurus: number;
}
export interface ProviderTransaction {
  paymentId: string;
  conversationId: string | null;
  amountKurus: number;
  kind: 'odeme' | 'iade';
  at: Date;
}

export interface IyzicoApi {
  initCheckoutForm(p: CheckoutInit): Promise<CheckoutInitResult>;
  retrieveCheckoutForm(token: string): Promise<CheckoutResult>;
  createProduct(p: { name: string; description?: string }): Promise<{ referenceCode: string }>;
  createPricingPlan(
    productRef: string,
    p: {
      name: string;
      priceKurus: number;
      paymentInterval: 'MONTHLY' | 'YEARLY';
      paymentIntervalCount: number;
      trialPeriodDays?: number;
    },
  ): Promise<{ referenceCode: string }>;
  initSubscriptionCheckout(p: SubscriptionInit): Promise<CheckoutInitResult>;
  retrieveSubscriptionCheckout(token: string): Promise<{
    status: 'success' | 'failure';
    subscriptionReferenceCode: string | null;
    customerReferenceCode: string | null;
  }>;
  retrieveSubscription(ref: string): Promise<SubscriptionDetail>;
  cancelSubscription(ref: string): Promise<void>;
  retrySubscriptionOrder(orderRef: string): Promise<{ status: 'success' | 'failure' }>;
  refund(p: {
    paymentId: string;
    priceKurus: number;
    conversationId: string;
    ip: string;
  }): Promise<RefundResult>;
  /** Daily transaction report used by billing.reconcile. */
  listTransactions(day: Date): Promise<ProviderTransaction[]>;
}

/** iyzico takes decimal TRY strings ("109.0"). */
export const kurusToTry = (k: number): string => (k / 100).toFixed(2);
export const tryToKurus = (v: number | string): number => Math.round(Number(v) * 100);

interface IyzResponse {
  status?: string;
  errorMessage?: string;
  [k: string]: unknown;
}

export class HttpIyzico implements IyzicoApi {
  constructor(
    private readonly cfg: IyzicoConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    assertSandbox(cfg);
  }

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<IyzResponse> {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const rnd = `${Date.now()}${randomBytes(6).toString('hex')}`;
    const pathOnly = path.split('?')[0] as string;
    let json: IyzResponse;
    try {
      const res = await this.fetchFn(this.cfg.baseUrl + path, {
        method,
        headers: {
          Authorization: authorizationHeader(this.cfg, pathOnly, raw, rnd),
          'x-iyzi-rnd': rnd,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: method === 'POST' ? raw : undefined,
      });
      json = (await res.json()) as IyzResponse;
    } catch {
      throw new IyzicoError(pathOnly, false);
    }
    if (json.status !== 'success')
      throw new IyzicoError(
        pathOnly,
        json.status === 'failure',
        (json.errorCode as string | undefined) ?? null,
      );
    return json;
  }

  async initCheckoutForm(p: CheckoutInit): Promise<CheckoutInitResult> {
    const r = await this.call('POST', '/payment/iyzipos/checkoutform/initialize/auth/ecom', {
      locale: 'tr',
      conversationId: p.conversationId,
      price: kurusToTry(p.priceKurus),
      paidPrice: kurusToTry(p.paidPriceKurus),
      currency: 'TRY',
      basketId: p.basketId,
      paymentGroup: 'PRODUCT',
      callbackUrl: p.callbackUrl,
      enabledInstallments: [1],
      buyer: { ...p.buyer, registrationAddress: p.buyer.address },
      billingAddress: {
        contactName: `${p.buyer.name} ${p.buyer.surname}`,
        city: p.buyer.city,
        country: p.buyer.country,
        address: p.buyer.address,
      },
      basketItems: [
        {
          id: p.item.id,
          name: p.item.name,
          category1: p.item.category,
          itemType: 'VIRTUAL',
          price: kurusToTry(p.priceKurus),
        },
      ],
    });
    return {
      token: String(r.token),
      checkoutFormContent: String(r.checkoutFormContent),
      paymentPageUrl: (r.paymentPageUrl as string | undefined) ?? null,
    };
  }

  async retrieveCheckoutForm(token: string): Promise<CheckoutResult> {
    const r = await this.call('POST', '/payment/iyzipos/checkoutform/auth/ecom/detail', {
      locale: 'tr',
      token,
    });
    return {
      status: 'success',
      paymentStatus: String(r.paymentStatus),
      paymentId: r.paymentId ? String(r.paymentId) : null,
      basketId: (r.basketId as string | undefined) ?? null,
      conversationId: (r.conversationId as string | undefined) ?? null,
      paidPriceKurus: r.paidPrice !== undefined ? tryToKurus(r.paidPrice as number) : null,
      fraudStatus: (r.fraudStatus as number | undefined) ?? null,
      currency: (r.currency as string | undefined) ?? null,
    };
  }

  async createProduct(p: { name: string; description?: string }) {
    const r = await this.call('POST', '/v2/subscription/products', { locale: 'tr', ...p });
    return { referenceCode: String((r.data as { referenceCode: string }).referenceCode) };
  }

  async createPricingPlan(
    productRef: string,
    p: {
      name: string;
      priceKurus: number;
      paymentInterval: 'MONTHLY' | 'YEARLY';
      paymentIntervalCount: number;
      trialPeriodDays?: number;
    },
  ) {
    const r = await this.call(
      'POST',
      `/v2/subscription/products/${encodeURIComponent(productRef)}/pricing-plans`,
      {
        locale: 'tr',
        name: p.name,
        price: kurusToTry(p.priceKurus),
        currencyCode: 'TRY',
        paymentInterval: p.paymentInterval,
        paymentIntervalCount: p.paymentIntervalCount,
        trialPeriodDays: p.trialPeriodDays,
        planPaymentType: 'RECURRING',
      },
    );
    return { referenceCode: String((r.data as { referenceCode: string }).referenceCode) };
  }

  async initSubscriptionCheckout(p: SubscriptionInit): Promise<CheckoutInitResult> {
    const r = await this.call('POST', '/v2/subscription/checkoutform/initialize', {
      locale: 'tr',
      conversationId: p.conversationId,
      pricingPlanReferenceCode: p.pricingPlanReferenceCode,
      subscriptionInitialStatus: 'ACTIVE',
      callbackUrl: p.callbackUrl,
      customer: {
        name: p.customer.name,
        surname: p.customer.surname,
        email: p.customer.email,
        identityNumber: p.customer.identityNumber,
        billingAddress: {
          contactName: `${p.customer.name} ${p.customer.surname}`,
          city: p.customer.city,
          country: p.customer.country,
          address: p.customer.address,
        },
      },
    });
    return {
      token: String(r.token),
      checkoutFormContent: String(r.checkoutFormContent),
      paymentPageUrl: null,
    };
  }

  async retrieveSubscriptionCheckout(token: string) {
    const r = await this.call('GET', `/v2/subscription/checkoutform/${encodeURIComponent(token)}`);
    const d = (r.data ?? {}) as { referenceCode?: string; customerReferenceCode?: string };
    return {
      status: 'success' as const,
      subscriptionReferenceCode: d.referenceCode ?? null,
      customerReferenceCode: d.customerReferenceCode ?? null,
    };
  }

  async retrieveSubscription(ref: string): Promise<SubscriptionDetail> {
    const r = await this.call('GET', `/v2/subscription/subscriptions/${encodeURIComponent(ref)}`);
    const d = ((r.data as { items?: unknown[] })?.items?.[0] ?? r.data) as Record<string, unknown>;
    return {
      referenceCode: String(d.referenceCode),
      status: String(d.subscriptionStatus),
      pricingPlanReferenceCode: String(d.pricingPlanReferenceCode),
      startDate: (d.startDate as number | undefined) ?? null,
      endDate: (d.endDate as number | undefined) ?? null,
      orders: ((d.orders as Record<string, unknown>[] | undefined) ?? []).map((o) => ({
        referenceCode: String(o.referenceCode),
        price: tryToKurus(o.price as number),
        currencyCode: String(o.currencyCode ?? 'TRY'),
        startPeriod: Number(o.startPeriod ?? 0),
        endPeriod: Number(o.endPeriod ?? 0),
        orderStatus: String(o.orderStatus),
        paymentAttempts: ((o.paymentAttempts as Record<string, unknown>[] | undefined) ?? []).map((a) => ({
          paymentStatus: String(a.paymentStatus),
          paymentId: a.paymentId === undefined || a.paymentId === null ? null : String(a.paymentId),
          createdDate: Number(a.createdDate ?? 0),
        })),
      })),
    };
  }

  async cancelSubscription(ref: string) {
    await this.call('POST', `/v2/subscription/subscriptions/${encodeURIComponent(ref)}/cancel`, {});
  }

  async retrySubscriptionOrder(orderRef: string) {
    try {
      await this.call('POST', '/v2/subscription/operation/retry', { referenceCode: orderRef });
      return { status: 'success' as const };
    } catch (e) {
      // Only a definite failure counts as a failed retry; an unknown outcome is re-queried later.
      if (e instanceof IyzicoError && e.definite) return { status: 'failure' as const };
      throw e;
    }
  }

  async refund(p: {
    paymentId: string;
    priceKurus: number;
    conversationId: string;
    ip: string;
  }): Promise<RefundResult> {
    const r = await this.call('POST', '/v2/payment/refund', {
      locale: 'tr',
      conversationId: p.conversationId,
      paymentId: p.paymentId,
      price: kurusToTry(p.priceKurus),
      currency: 'TRY',
      ip: p.ip,
    });
    return { status: 'success', paymentId: String(r.paymentId ?? p.paymentId), priceKurus: p.priceKurus };
  }

  /**
   * GET /v2/reporting/payment/transactions?transactionDate=YYYY-MM-DD&page=n (docs.iyzico.com, Daily
   * Transactions Reporting). PAYMENT lines give transactionId and paidPrice; REFUND lines are returned as
   * kind iade with the transaction id (their link to the payment is not documented, see DEVIR).
   */
  async listTransactions(day: Date): Promise<ProviderTransaction[]> {
    const date = day.toISOString().slice(0, 10);
    const out: ProviderTransaction[] = [];
    for (let page = 1; page <= 100; page++) {
      const r = await this.call(
        'GET',
        `/v2/reporting/payment/transactions?transactionDate=${date}&page=${page}`,
      );
      for (const t of (r.transactions as Record<string, unknown>[] | undefined) ?? []) {
        const type = String(t.transactionType);
        if (type !== 'PAYMENT' && type !== 'REFUND') continue;
        out.push({
          paymentId: String(t.transactionId),
          conversationId: (t.conversationId as string | undefined) ?? null,
          amountKurus: tryToKurus((t.paidPrice ?? t.price) as number),
          kind: type === 'PAYMENT' ? 'odeme' : 'iade',
          at: new Date(String(t.transactionDate).replace(' ', 'T') + '+03:00'),
        });
      }
      if (page >= Number(r.totalPageCount ?? 1)) break;
    }
    return out;
  }
}
