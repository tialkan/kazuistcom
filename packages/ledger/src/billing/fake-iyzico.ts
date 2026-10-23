/**
 * In memory iyzico shaped like the documented sandbox answers (docs.iyzico.com, checked 2026-10-22):
 * - Checkout Form detail: paymentStatus, paymentId, basketId, paidPrice, currency, fraudStatus (1, 0, -1).
 * - Subscription detail: orders[] with orderStatus (WAITING, SUCCESS, FAILED) and paymentAttempts[] whose
 *   successful attempt carries the numeric paymentId; the first order exists right after checkout.
 * - Subscription webhooks (subscription.order.success / failure) are sent for the first order too.
 * Tests drive it with the simulate helpers, which return correctly signed webhook payloads.
 */
import {
  IyzicoError,
  webhookSignature,
  type CheckoutInit,
  type CheckoutInitResult,
  type CheckoutResult,
  type HppWebhook,
  type IyzicoApi,
  type ProviderTransaction,
  type RefundResult,
  type SubscriptionDetail,
  type SubscriptionInit,
  type SubscriptionOrder,
  type SubscriptionWebhook,
} from './iyzico.ts';
import { istanbulDay } from '../rules.ts';

export const FAKE_CFG = {
  secretKey: 'test-secret-not-real',
  merchantId: 'test-merchant',
  apiKey: 'test-api',
};

interface FakeCheckout {
  init: CheckoutInit;
  outcome: 'success' | 'threeds_failure' | 'pending';
  fraudStatus: 1 | 2 | 0 | -1;
  paymentId: string;
}
interface FakeSub {
  ref: string;
  customerRef: string;
  planRef: string;
  status: SubscriptionDetail['status'];
  orders: SubscriptionOrder[];
  priceKurus: number;
}

export class FakeIyzico implements IyzicoApi {
  private seq = 0;
  private paymentSeq = 24000;
  readonly checkouts = new Map<string, FakeCheckout>();
  readonly subCheckouts = new Map<string, { init: SubscriptionInit; subRef: string | null }>();
  readonly subs = new Map<string, FakeSub>();
  readonly plans = new Map<
    string,
    { productRef: string; priceKurus: number; interval: 'MONTHLY' | 'YEARLY' }
  >();
  readonly products = new Map<string, string>();
  readonly transactions: ProviderTransaction[] = [];
  readonly refunds: (RefundResult & { conversationId: string })[] = [];
  readonly canceled: string[] = [];
  /** Next checkout outcome and fraud status (3DS failure and fraud review scenarios). */
  nextOutcome: FakeCheckout['outcome'] = 'success';
  nextFraudStatus: FakeCheckout['fraudStatus'] = 1;
  /** Results of upcoming subscription retries. */
  retryOutcomes: ('success' | 'failure')[] = [];
  /** Next subscription cancel call fails: definite (iyzico said failure) or unknown (timeout, not applied). */
  failNextCancel: 'definite' | 'unknown' | null = null;
  /** Next refund call: ok, definite failure (iyzico said failure) or unknown outcome (timeout). */
  nextRefund: 'ok' | 'definite' | 'unknown' = 'ok';
  now: () => Date = () => new Date();

  private id(p: string) {
    return `${p}-${++this.seq}`;
  }
  private paymentId() {
    return String(++this.paymentSeq);
  }

  async initCheckoutForm(p: CheckoutInit): Promise<CheckoutInitResult> {
    const token = this.id('tok');
    this.checkouts.set(token, {
      init: p,
      outcome: this.nextOutcome,
      fraudStatus: this.nextFraudStatus,
      paymentId: this.paymentId(),
    });
    this.nextOutcome = 'success';
    this.nextFraudStatus = 1;
    return {
      token,
      checkoutFormContent: '<script>/* iyzico form */</script>',
      paymentPageUrl: `https://sandbox-cpp.iyzipay.com?token=${token}`,
    };
  }

  async retrieveCheckoutForm(token: string): Promise<CheckoutResult> {
    const c = this.checkouts.get(token);
    if (!c)
      return {
        status: 'failure',
        paymentStatus: 'FAILURE',
        paymentId: null,
        basketId: null,
        conversationId: null,
        paidPriceKurus: null,
        fraudStatus: null,
        currency: null,
      };
    const ok = c.outcome === 'success';
    if (ok && c.fraudStatus !== -1 && !this.transactions.some((t) => t.paymentId === c.paymentId))
      this.transactions.push({
        paymentId: c.paymentId,
        conversationId: c.init.conversationId,
        amountKurus: c.init.paidPriceKurus,
        kind: 'odeme',
        at: this.now(),
      });
    return {
      status: 'success',
      paymentStatus: ok ? 'SUCCESS' : c.outcome === 'pending' ? 'INIT_THREEDS' : 'FAILURE',
      paymentId: ok ? c.paymentId : null,
      basketId: c.init.basketId,
      conversationId: c.init.conversationId,
      paidPriceKurus: ok ? c.init.paidPriceKurus : null,
      fraudStatus: ok ? c.fraudStatus : null,
      currency: 'TRY',
    };
  }

  /** Fraud review finished (fraudStatus 0 becomes 2 approved, 1 or -1). */
  decideFraud(token: string, status: 1 | 2 | -1): void {
    const c = this.checkouts.get(token);
    if (c) c.fraudStatus = status;
  }

  async createProduct(p: { name: string }) {
    const ref = this.id('prod');
    this.products.set(ref, p.name);
    return { referenceCode: ref };
  }

  async createPricingPlan(
    productRef: string,
    p: { priceKurus: number; paymentInterval: 'MONTHLY' | 'YEARLY' },
  ) {
    const ref = this.id('plan');
    this.plans.set(ref, { productRef, priceKurus: p.priceKurus, interval: p.paymentInterval });
    return { referenceCode: ref };
  }

  async initSubscriptionCheckout(p: SubscriptionInit): Promise<CheckoutInitResult> {
    const token = this.id('stok');
    this.subCheckouts.set(token, { init: p, subRef: null });
    return {
      token,
      checkoutFormContent: '<script>/* iyzico subscription form */</script>',
      paymentPageUrl: null,
    };
  }

  private order(priceKurus: number, success: boolean): SubscriptionOrder {
    const at = this.now().getTime();
    return {
      referenceCode: this.id('ord'),
      price: priceKurus,
      currencyCode: 'TRY',
      startPeriod: at,
      endPeriod: at,
      orderStatus: success ? 'SUCCESS' : 'FAILED',
      paymentAttempts: [
        success
          ? { paymentStatus: 'SUCCESS', paymentId: this.paymentId(), createdDate: at }
          : { paymentStatus: 'FAILED', paymentId: null, createdDate: at },
      ],
    };
  }

  private charge(o: SubscriptionOrder) {
    const pid = o.paymentAttempts.find((a) => a.paymentStatus === 'SUCCESS')?.paymentId;
    if (pid)
      this.transactions.push({
        paymentId: pid,
        conversationId: null,
        amountKurus: o.price,
        kind: 'odeme',
        at: this.now(),
      });
  }

  async retrieveSubscriptionCheckout(token: string) {
    const c = this.subCheckouts.get(token);
    if (!c)
      return { status: 'failure' as const, subscriptionReferenceCode: null, customerReferenceCode: null };
    if (!c.subRef) {
      const plan = this.plans.get(c.init.pricingPlanReferenceCode);
      const ref = this.id('sub');
      const first = this.order(plan?.priceKurus ?? 0, true);
      this.subs.set(ref, {
        ref,
        customerRef: this.id('cust'),
        planRef: c.init.pricingPlanReferenceCode,
        status: 'ACTIVE',
        priceKurus: plan?.priceKurus ?? 0,
        orders: [first],
      });
      this.charge(first);
      c.subRef = ref;
    }
    const s = this.subs.get(c.subRef) as FakeSub;
    return {
      status: 'success' as const,
      subscriptionReferenceCode: s.ref,
      customerReferenceCode: s.customerRef,
    };
  }

  async retrieveSubscription(ref: string): Promise<SubscriptionDetail> {
    const s = this.subs.get(ref);
    if (!s) throw new IyzicoError('/v2/subscription/subscriptions', true);
    return {
      referenceCode: s.ref,
      status: s.status,
      pricingPlanReferenceCode: s.planRef,
      startDate: null,
      endDate: null,
      orders: s.orders.map((o) => ({ ...o, paymentAttempts: o.paymentAttempts.map((a) => ({ ...a })) })),
    };
  }

  async cancelSubscription(ref: string) {
    const fail = this.failNextCancel;
    this.failNextCancel = null;
    if (fail) throw new IyzicoError('/v2/subscription/subscriptions/cancel', fail === 'definite');
    const s = this.subs.get(ref);
    if (s) s.status = 'CANCELED';
    this.canceled.push(ref);
  }

  async retrySubscriptionOrder(orderRef: string) {
    const outcome = this.retryOutcomes.shift() ?? 'failure';
    for (const s of this.subs.values()) {
      const o = s.orders.find((x) => x.referenceCode === orderRef);
      if (!o) continue;
      const at = this.now().getTime();
      if (outcome === 'success') {
        o.orderStatus = 'SUCCESS';
        o.paymentAttempts.push({ paymentStatus: 'SUCCESS', paymentId: this.paymentId(), createdDate: at });
        s.status = 'ACTIVE';
        this.charge(o);
      } else o.paymentAttempts.push({ paymentStatus: 'FAILED', paymentId: null, createdDate: at });
    }
    return { status: outcome };
  }

  async refund(p: { paymentId: string; priceKurus: number; conversationId: string }): Promise<RefundResult> {
    const mode = this.nextRefund;
    this.nextRefund = 'ok';
    if (mode === 'definite') throw new IyzicoError('/v2/payment/refund', true, '5000');
    const r = {
      status: 'success' as const,
      paymentId: p.paymentId,
      priceKurus: p.priceKurus,
      conversationId: p.conversationId,
    };
    this.refunds.push(r);
    this.transactions.push({
      paymentId: p.paymentId,
      conversationId: p.conversationId,
      amountKurus: -p.priceKurus,
      kind: 'iade',
      at: this.now(),
    });
    // Unknown outcome: the refund went through at iyzico but the answer never arrived.
    if (mode === 'unknown') throw new IyzicoError('/v2/payment/refund', false);
    return r;
  }

  async listTransactions(day: string): Promise<ProviderTransaction[]> {
    return this.transactions.filter((t) => istanbulDay(t.at) === day);
  }

  /**
   * Fraud review notification (IFN). Kazuist uses it only as a trigger: the order is re-queried, so the
   * body carries just the identifiers iyzico sends (no signature is trusted yet).
   */
  fraudNotification(token: string): { paymentConversationId: string; paymentId: string; status: string } {
    const c = this.checkouts.get(token);
    if (!c) throw new Error('no checkout');
    return {
      paymentConversationId: c.init.conversationId,
      paymentId: c.paymentId,
      status: String(c.fraudStatus),
    };
  }

  /* Simulation helpers */

  checkoutWebhook(token: string): { body: HppWebhook; signature: string } {
    const c = this.checkouts.get(token);
    if (!c) throw new Error('no checkout');
    const body: HppWebhook = {
      iyziEventType: 'CHECKOUT_FORM_AUTH',
      iyziPaymentId: c.paymentId,
      token,
      paymentConversationId: c.init.conversationId,
      status: c.outcome === 'success' ? 'SUCCESS' : 'FAILURE',
      iyziReferenceCode: `ref-${token}-${c.fraudStatus}`,
      merchantId: FAKE_CFG.merchantId,
      iyziEventTime: this.now().getTime(),
    };
    return { body, signature: webhookSignature(FAKE_CFG, body) };
  }

  private subWebhook(s: FakeSub, o: SubscriptionOrder): { body: SubscriptionWebhook; signature: string } {
    const body: SubscriptionWebhook = {
      iyziEventType:
        o.orderStatus === 'SUCCESS' ? 'subscription.order.success' : 'subscription.order.failure',
      subscriptionReferenceCode: s.ref,
      orderReferenceCode: o.referenceCode,
      customerReferenceCode: s.customerRef,
      iyziReferenceCode: this.id('evt'),
      iyziEventTime: this.now().getTime(),
    };
    return { body, signature: webhookSignature(FAKE_CFG, body) };
  }

  /** iyzico also notifies the first (checkout) order of a subscription. */
  initialOrderWebhook(subRef: string): { body: SubscriptionWebhook; signature: string } {
    const s = this.subs.get(subRef);
    if (!s || !s.orders[0]) throw new Error('no sub');
    return this.subWebhook(s, s.orders[0]);
  }

  /** A renewal charge happens at iyzico; returns the signed webhook it would send. */
  simulateRenewal(subRef: string, success: boolean): { body: SubscriptionWebhook; signature: string } {
    const s = this.subs.get(subRef);
    if (!s) throw new Error('no sub');
    // A canceled subscription is not charged again; iyzico would at most resend the last order's event.
    if (s.status === 'CANCELED' && s.orders.length)
      return this.subWebhook(s, s.orders[s.orders.length - 1] as SubscriptionOrder);
    const o = this.order(s.priceKurus, success);
    s.orders.push(o);
    s.status = success ? 'ACTIVE' : 'UNPAID';
    if (success) this.charge(o);
    return this.subWebhook(s, o);
  }
}
