/**
 * In memory iyzico that mirrors the sandbox behaviour used by the 9.5 scenarios. Tests drive it with
 * the `simulate*` helpers, which also return correctly signed webhook payloads.
 */
import {
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
  type SubscriptionWebhook,
} from './iyzico.ts';

export const FAKE_CFG = {
  secretKey: 'test-secret-not-real',
  merchantId: 'test-merchant',
  apiKey: 'test-api',
};

interface FakeCheckout {
  init: CheckoutInit;
  outcome: 'success' | 'threeds_failure' | 'pending';
  paymentId: string;
}
interface FakeSub {
  ref: string;
  customerRef: string;
  planRef: string;
  status: SubscriptionDetail['status'];
  orders: SubscriptionDetail['orders'];
  priceKurus: number;
}

export class FakeIyzico implements IyzicoApi {
  private seq = 0;
  readonly checkouts = new Map<string, FakeCheckout>();
  readonly subCheckouts = new Map<string, { init: SubscriptionInit; subRef: string | null }>();
  readonly subs = new Map<string, FakeSub>();
  readonly plans = new Map<
    string,
    { productRef: string; priceKurus: number; interval: 'MONTHLY' | 'YEARLY' }
  >();
  readonly products = new Map<string, string>();
  readonly transactions: ProviderTransaction[] = [];
  readonly refunds: RefundResult[] = [];
  /** Next checkout outcome (3DS failure scenario). */
  nextOutcome: FakeCheckout['outcome'] = 'success';
  /** Results of upcoming subscription retries. */
  retryOutcomes: ('success' | 'failure')[] = [];
  now: () => Date = () => new Date();

  private id(p: string) {
    return `${p}-${++this.seq}`;
  }

  async initCheckoutForm(p: CheckoutInit): Promise<CheckoutInitResult> {
    const token = this.id('tok');
    this.checkouts.set(token, { init: p, outcome: this.nextOutcome, paymentId: String(1000 + this.seq) });
    this.nextOutcome = 'success';
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
      };
    const ok = c.outcome === 'success';
    if (ok && !this.transactions.some((t) => t.paymentId === c.paymentId))
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
      fraudStatus: ok ? 1 : null,
    };
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

  async retrieveSubscriptionCheckout(token: string) {
    const c = this.subCheckouts.get(token);
    if (!c)
      return { status: 'failure' as const, subscriptionReferenceCode: null, customerReferenceCode: null };
    if (!c.subRef) {
      const plan = this.plans.get(c.init.pricingPlanReferenceCode);
      const ref = this.id('sub');
      const now = this.now().getTime();
      this.subs.set(ref, {
        ref,
        customerRef: this.id('cust'),
        planRef: c.init.pricingPlanReferenceCode,
        status: 'ACTIVE',
        priceKurus: plan?.priceKurus ?? 0,
        orders: [
          {
            referenceCode: this.id('ord'),
            price: plan?.priceKurus ?? 0,
            paymentStatus: 'SUCCESS',
            startPeriod: now,
            endPeriod: now,
          },
        ],
      });
      this.transactions.push({
        paymentId: `subpay-${ref}-1`,
        conversationId: c.init.conversationId,
        amountKurus: plan?.priceKurus ?? 0,
        kind: 'odeme',
        at: this.now(),
      });
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
    if (!s) throw new Error('not found');
    return {
      referenceCode: s.ref,
      status: s.status,
      pricingPlanReferenceCode: s.planRef,
      startDate: null,
      endDate: null,
      orders: s.orders.map((o) => ({ ...o })),
    };
  }

  async cancelSubscription(ref: string) {
    const s = this.subs.get(ref);
    if (s) s.status = 'CANCELED';
  }

  async retrySubscriptionOrder(orderRef: string) {
    const outcome = this.retryOutcomes.shift() ?? 'failure';
    for (const s of this.subs.values()) {
      const o = s.orders.find((x) => x.referenceCode === orderRef);
      if (o && outcome === 'success') {
        o.paymentStatus = 'SUCCESS';
        s.status = 'ACTIVE';
        this.transactions.push({
          paymentId: `subpay-${orderRef}`,
          conversationId: null,
          amountKurus: o.price,
          kind: 'odeme',
          at: this.now(),
        });
      }
    }
    return { status: outcome };
  }

  async refund(p: { paymentId: string; priceKurus: number }): Promise<RefundResult> {
    const r: RefundResult = { status: 'success', paymentId: p.paymentId, priceKurus: p.priceKurus };
    this.refunds.push(r);
    this.transactions.push({
      paymentId: p.paymentId,
      conversationId: null,
      amountKurus: -p.priceKurus,
      kind: 'iade',
      at: this.now(),
    });
    return r;
  }

  async listTransactions(day: Date): Promise<ProviderTransaction[]> {
    const d = day.toISOString().slice(0, 10);
    return this.transactions.filter((t) => t.at.toISOString().slice(0, 10) === d);
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
      iyziReferenceCode: `ref-${token}`,
      merchantId: FAKE_CFG.merchantId,
      iyziEventTime: this.now().getTime(),
    };
    return { body, signature: webhookSignature(FAKE_CFG, body) };
  }

  /** A renewal charge happens at iyzico; returns the signed webhook it would send. */
  simulateRenewal(subRef: string, success: boolean): { body: SubscriptionWebhook; signature: string } {
    const s = this.subs.get(subRef);
    if (!s) throw new Error('no sub');
    const orderRef = this.id('ord');
    const now = this.now().getTime();
    s.orders.push({
      referenceCode: orderRef,
      price: s.priceKurus,
      paymentStatus: success ? 'SUCCESS' : 'FAILURE',
      startPeriod: now,
      endPeriod: now,
    });
    s.status = success ? 'ACTIVE' : 'UNPAID';
    if (success)
      this.transactions.push({
        paymentId: `subpay-${orderRef}`,
        conversationId: null,
        amountKurus: s.priceKurus,
        kind: 'odeme',
        at: this.now(),
      });
    const body: SubscriptionWebhook = {
      iyziEventType: success ? 'subscription.order.success' : 'subscription.order.failure',
      subscriptionReferenceCode: s.ref,
      orderReferenceCode: orderRef,
      customerReferenceCode: s.customerRef,
      iyziReferenceCode: this.id('evt'),
      iyziEventTime: now,
    };
    return { body, signature: webhookSignature(FAKE_CFG, body) };
  }
}
