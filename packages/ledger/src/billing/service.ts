/**
 * Billing service (plan 9.2, 4.5): checkout, server side re-query, webhooks, subscriptions, dunning,
 * cancellation, refunds, chargeback, monthly grants, reconciliation and notices.
 */
import {
  ACCOUNTS,
  LedgerError,
  PRICE_TABLE_V1,
  addMonths,
  annualGrantsDue,
  applyDiscount,
  checkCoupon,
  decideCancel,
  effectiveTable,
  findProduct,
  nextDunningStep,
  normalizeCouponCode,
  packageRefundAllowed,
  priceChangeEffectiveAt,
  reconcile,
  renewalNotices,
  type LedgerTx,
  type PriceTable,
  type ReconDiff,
} from '../index.ts';
import type { EArsivProvider } from './earsiv.ts';
import {
  isSubscriptionWebhook,
  verifyWebhookSignature,
  type CheckoutInit,
  type IyzicoApi,
  type IyzicoConfig,
  type IyzicoWebhook,
} from './iyzico.ts';
import type { BillingStore, Consent, LedgerPort, Order, Subscription } from './store.ts';

export class BillingError extends Error {
  constructor(
    public readonly status: 400 | 401 | 402 | 404 | 409,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'BillingError';
  }
}

export interface BillingDeps {
  iyzico: IyzicoApi;
  iyzicoCfg: Pick<IyzicoConfig, 'secretKey' | 'merchantId'>;
  earsiv: EArsivProvider;
  store: BillingStore;
  ledger: LedgerPort;
  priceTables?: PriceTable[];
  now: () => Date;
  newId: () => string;
  callbackBaseUrl: string;
  webAddress: string;
}

export type Buyer = CheckoutInit['buyer'];

const PLAN_NAMES: Record<string, string> = {
  'ogrenci.aylik': 'Öğrenci Plus aylık',
  'ogrenci.yillik': 'Öğrenci Plus yıllık',
  'akademisyen.aylik': 'Akademisyen aylık',
  'akademisyen.yillik': 'Akademisyen yıllık',
};

const day = (d: Date) => d.toISOString().slice(0, 10);

export class BillingService {
  constructor(private readonly d: BillingDeps) {}

  private get s(): BillingStore {
    return this.d.store;
  }

  private table(): PriceTable {
    const t = effectiveTable(this.d.priceTables ?? [PRICE_TABLE_V1], this.d.now());
    if (!t) throw new BillingError(409, 'no_price_table');
    return t;
  }

  prices(): PriceTable {
    return this.table();
  }

  /** Define iyzico subscription product and pricing plans (9.2/2). Idempotent per planCode. */
  async setupSubscriptionCatalog(): Promise<Map<string, string>> {
    const refs = await this.s.planRefs();
    const subs = this.table().products.filter((p) => p.kind === 'abonelik' && !refs.has(p.code));
    if (!subs.length) return refs;
    const productRef = (await this.d.iyzico.createProduct({ name: 'Kazuist Plan' })).referenceCode;
    for (const p of subs) {
      const r = await this.d.iyzico.createPricingPlan(productRef, {
        name: PLAN_NAMES[p.code] ?? p.code,
        priceKurus: p.priceKurus,
        paymentInterval: p.interval === 'yillik' ? 'YEARLY' : 'MONTHLY',
        paymentIntervalCount: 1,
      });
      await this.s.savePlanRef(p.code, r.referenceCode);
      refs.set(p.code, r.referenceCode);
    }
    return refs;
  }

  private consents(userId: string, items: [Consent['kind'], string, boolean][], ctx: Consent['context']) {
    const at = this.d.now();
    return this.s.addConsents(
      items.map(([kind, version, granted]) => ({
        userId,
        kind,
        version,
        granted,
        context: { ...ctx, channel: 'web' },
        at,
      })),
    );
  }

  /** POST /v1/checkout/topup. Requires the confirmation and the separate withdrawal exception boxes. */
  async startTopup(
    userId: string,
    idempotencyKey: string,
    input: {
      productCode: string;
      couponCode?: string;
      preInfoConsentVersion: string;
      distanceContractConsentVersion: string;
      withdrawalWaiver: boolean;
    },
    buyer: Buyer,
  ) {
    const existing = await this.s.findOrderByKey(userId, idempotencyKey);
    if (existing)
      return {
        orderId: existing.id,
        checkoutFormContent: existing.consentVersions.form as string,
        paymentPageUrl: null,
      };
    if (!input.preInfoConsentVersion || !input.distanceContractConsentVersion)
      throw new BillingError(400, 'consent_required');
    if (!input.withdrawalWaiver) throw new BillingError(400, 'withdrawal_waiver_required');
    const product = findProduct(this.table(), input.productCode);
    if (!product || product.kind !== 'paket') throw new BillingError(400, 'unknown_product');
    let amount = product.priceKurus;
    let couponCode: string | null = null;
    if (input.couponCode) {
      couponCode = normalizeCouponCode(input.couponCode);
      const c = checkCoupon(await this.s.getCoupon(couponCode), this.d.now());
      if (!c.ok || c.kind !== 'indirim') throw new BillingError(400, 'invalid_coupon');
      amount = applyDiscount(amount, c.percentOff);
    }
    const orderId = this.d.newId();
    const init = await this.d.iyzico.initCheckoutForm({
      conversationId: orderId,
      basketId: orderId,
      priceKurus: amount,
      paidPriceKurus: amount,
      callbackUrl: `${this.d.callbackBaseUrl}/api/v1/checkout/callback`,
      buyer,
      item: { id: product.code, name: `Kazuist ${product.credits} kredi`, category: 'Dijital hizmet' },
    });
    const order: Order = {
      id: orderId,
      userId,
      productCode: product.code,
      couponCode,
      amountKurus: amount,
      status: 'bekliyor',
      idempotencyKey,
      consentVersions: {
        preInfo: input.preInfoConsentVersion,
        distance: input.distanceContractConsentVersion,
        waiver: input.withdrawalWaiver,
        form: init.checkoutFormContent,
      },
      checkoutToken: init.token,
      paymentId: null,
      createdAt: this.d.now(),
      paidAt: null,
    };
    await this.s.saveOrder(order);
    if (couponCode && !(await this.s.redeemCoupon(couponCode, userId, { orderId })))
      throw new BillingError(409, 'coupon_already_used');
    await this.consents(
      userId,
      [
        ['on_bilgilendirme', input.preInfoConsentVersion, true],
        ['mesafeli_sozlesme', input.distanceContractConsentVersion, true],
        ['cayma_istisnasi', input.distanceContractConsentVersion, input.withdrawalWaiver],
      ],
      { orderId, productCode: product.code },
    );
    return { orderId, checkoutFormContent: init.checkoutFormContent, paymentPageUrl: init.paymentPageUrl };
  }

  /**
   * Callback and webhook both land here: the token is re-queried at iyzico and only a SUCCESS whose
   * basket and amount match the order grants credits. Safe to call many times.
   */
  async completeCheckout(token: string): Promise<Order> {
    const order = await this.s.findOrderByToken(token);
    if (!order) throw new BillingError(404, 'order_not_found');
    if (order.status === 'odendi' || order.status === 'iade_edildi') return order;
    const r = await this.d.iyzico.retrieveCheckoutForm(token);
    const ok =
      r.status === 'success' &&
      r.paymentStatus === 'SUCCESS' &&
      r.basketId === order.id &&
      r.paidPriceKurus === order.amountKurus &&
      r.paymentId !== null;
    if (!ok) {
      if (r.paymentStatus === 'FAILURE') {
        order.status = 'basarisiz';
        await this.s.saveOrder(order);
      }
      return order;
    }
    const product = findProduct(this.table(), order.productCode);
    const credits = product?.credits ?? 0;
    const walletId = await this.s.walletOf(order.userId);
    await this.d.ledger.run(walletId, (l) =>
      l.grant({
        key: `iyzico:odeme:${r.paymentId}`,
        walletId,
        source: 'paket',
        credits,
        originRef: `order:${order.id}`,
        now: this.d.now(),
      }),
    );
    order.status = 'odendi';
    order.paymentId = r.paymentId;
    order.paidAt = this.d.now();
    await this.s.saveOrder(order);
    await this.s.addPayment({
      orderId: order.id,
      subscriptionId: null,
      providerPaymentId: r.paymentId as string,
      refundRef: null,
      amountKurus: order.amountKurus,
      kind: 'odeme',
      at: this.d.now(),
    });
    await this.invoice(order.userId, order.id, 'satis', order.amountKurus, `Kazuist ${credits} kredi`);
    await this.notify(order.userId, 'odeme_alindi', this.d.now(), order.id);
    return order;
  }

  private async invoice(
    userId: string,
    orderId: string | null,
    kind: 'satis' | 'iade',
    totalKurus: number,
    description: string,
  ) {
    const inv = await this.d.earsiv.issue({
      orderId: orderId ?? '',
      userId,
      kind,
      totalKurus,
      description,
      buyerEmail: '',
      internetSale: {
        webAddress: this.d.webAddress,
        paymentMethod: 'kart',
        paymentAgent: 'iyzico',
        paidAt: this.d.now(),
      },
    });
    await this.s.addInvoice({
      id: this.d.newId(),
      userId,
      orderId,
      number: inv.number,
      kind,
      totalKurus,
      providerRef: inv.providerRef,
      issuedAt: inv.issuedAt,
    });
  }

  private notify(userId: string, kind: string, sendAt: Date, ref: string) {
    return this.s.addNotice({ userId, kind, sendAt, ref });
  }

  /** POST /v1/webhooks/iyzico: signature, idempotency on iyziReferenceCode, then re-query. */
  async handleWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<{ status: 200 | 400 | 401; duplicate?: boolean }> {
    let body: IyzicoWebhook;
    try {
      body = JSON.parse(rawBody) as IyzicoWebhook;
    } catch {
      return { status: 400 };
    }
    if (!body || typeof body !== 'object' || typeof body.iyziReferenceCode !== 'string')
      return { status: 400 };
    if (!verifyWebhookSignature(this.d.iyzicoCfg, body, signature)) return { status: 401 };
    const eventId = body.iyziReferenceCode;
    const seen = await this.s.getWebhook(eventId);
    if (seen?.processedAt) return { status: 200, duplicate: true };
    const ev = seen ?? {
      provider: 'iyzico' as const,
      eventId,
      eventType: body.iyziEventType,
      signatureValid: true,
      payload: body,
      processedAt: null,
      error: null,
    };
    await this.s.saveWebhook(ev);
    try {
      if (isSubscriptionWebhook(body))
        await this.onSubscriptionOrder(body.subscriptionReferenceCode, body.orderReferenceCode);
      else await this.completeCheckout(body.token);
      ev.processedAt = this.d.now();
      ev.error = null;
      await this.s.saveWebhook(ev);
    } catch (e) {
      ev.error = e instanceof Error ? e.name : 'Error';
      await this.s.saveWebhook(ev);
      throw e;
    }
    return { status: 200 };
  }

  /* Subscriptions */

  async startSubscription(
    userId: string,
    idempotencyKey: string,
    input: { planCode: string; preInfoConsentVersion: string; distanceContractConsentVersion: string },
    buyer: Buyer,
  ) {
    const product = findProduct(this.table(), input.planCode);
    const planRef = (await this.s.planRefs()).get(input.planCode);
    if (!product || product.kind !== 'abonelik' || !planRef) throw new BillingError(400, 'unknown_plan');
    if (!input.preInfoConsentVersion || !input.distanceContractConsentVersion)
      throw new BillingError(400, 'consent_required');
    const existing = await this.s.findOrderByKey(userId, idempotencyKey);
    if (existing)
      return {
        orderId: existing.id,
        checkoutFormContent: existing.consentVersions.form as string,
        paymentPageUrl: null,
      };
    const orderId = this.d.newId();
    const init = await this.d.iyzico.initSubscriptionCheckout({
      conversationId: orderId,
      pricingPlanReferenceCode: planRef,
      callbackUrl: `${this.d.callbackBaseUrl}/api/v1/checkout/subscription-callback`,
      customer: buyer,
    });
    await this.s.saveOrder({
      id: orderId,
      userId,
      productCode: product.code,
      couponCode: null,
      amountKurus: product.priceKurus,
      status: 'bekliyor',
      idempotencyKey,
      consentVersions: {
        preInfo: input.preInfoConsentVersion,
        distance: input.distanceContractConsentVersion,
        form: init.checkoutFormContent,
      },
      checkoutToken: init.token,
      paymentId: null,
      createdAt: this.d.now(),
      paidAt: null,
    });
    // Subscription step: abonelik_sozlesmesi, plus yillik_taahhutname for annual plans (ADR-0023).
    const items: [Consent['kind'], string, boolean][] = [
      ['on_bilgilendirme', input.preInfoConsentVersion, true],
      ['abonelik_sozlesmesi', input.distanceContractConsentVersion, true],
    ];
    if (product.interval === 'yillik')
      items.push(['yillik_taahhutname', input.distanceContractConsentVersion, true]);
    await this.consents(userId, items, { orderId, productCode: product.code });
    return { orderId, checkoutFormContent: init.checkoutFormContent, paymentPageUrl: init.paymentPageUrl };
  }

  /** Subscription checkout callback: re-query, create the subscription and deliver the first grant. */
  async completeSubscriptionCheckout(token: string): Promise<Subscription> {
    const order = await this.s.findOrderByToken(token);
    if (!order) throw new BillingError(404, 'order_not_found');
    const r = await this.d.iyzico.retrieveSubscriptionCheckout(token);
    if (r.status !== 'success' || !r.subscriptionReferenceCode) {
      order.status = 'basarisiz';
      await this.s.saveOrder(order);
      throw new BillingError(402, 'subscription_failed');
    }
    const ref = r.subscriptionReferenceCode;
    const found = await this.s.findSubscriptionByRef(ref);
    if (found) return found;
    const product = findProduct(this.table(), order.productCode);
    if (!product) throw new BillingError(400, 'unknown_plan');
    const now = this.d.now();
    const sub: Subscription = {
      id: this.d.newId(),
      userId: order.userId,
      planCode: product.code,
      providerRef: ref,
      status: 'aktif',
      priceKurus: product.priceKurus,
      currentPeriodStart: now,
      currentPeriodEnd: addMonths(now, product.interval === 'yillik' ? 12 : 1),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      grantsDelivered: 0,
      lastPaymentId: `subpay-${ref}-1`,
      firstFailureAt: null,
      failedRetries: 0,
      failedOrderRef: null,
      pendingPrice: null,
    };
    await this.s.saveSubscription(sub);
    order.status = 'odendi';
    order.paidAt = now;
    order.paymentId = sub.lastPaymentId;
    await this.s.saveOrder(order);
    await this.s.addPayment({
      orderId: order.id,
      subscriptionId: sub.id,
      providerPaymentId: sub.lastPaymentId as string,
      refundRef: null,
      amountKurus: product.priceKurus,
      kind: 'odeme',
      at: now,
    });
    await this.s.setPlan(sub.userId, product.code);
    await this.grantMonth(sub, 'ilk');
    await this.invoice(
      sub.userId,
      order.id,
      'satis',
      product.priceKurus,
      PLAN_NAMES[product.code] ?? product.code,
    );
    await this.scheduleRenewalNotices(sub);
    await this.s.saveSubscription(sub);
    return sub;
  }

  private async grantMonth(sub: Subscription, tag: string) {
    const product = findProduct(this.table(), sub.planCode);
    if (!product?.monthlyCredits) return;
    const walletId = await this.s.walletOf(sub.userId);
    const key = `abonelik:${sub.id}:${sub.currentPeriodStart.toISOString()}:${tag}`;
    await this.d.ledger.run(walletId, (l) =>
      l.grant({
        key,
        walletId,
        source: 'abonelik',
        credits: product.monthlyCredits as number,
        originRef: key,
        now: this.d.now(),
      }),
    );
    sub.grantsDelivered += 1;
  }

  private async scheduleRenewalNotices(sub: Subscription) {
    if (sub.cancelAtPeriodEnd || sub.status === 'iptal') return;
    const product = findProduct(this.table(), sub.planCode);
    for (const n of renewalNotices(sub.currentPeriodEnd, product?.interval ?? 'aylik'))
      await this.notify(sub.userId, n.kind, n.sendAt, `${sub.id}:${sub.currentPeriodEnd.toISOString()}`);
  }

  private async subByRef(ref: string): Promise<Subscription> {
    const s = await this.s.findSubscriptionByRef(ref);
    if (!s) throw new BillingError(404, 'subscription_not_found');
    return s;
  }

  /** Renewal or failed renewal, from the webhook; the order state is re-queried at iyzico. */
  async onSubscriptionOrder(subRef: string, orderRef: string): Promise<Subscription> {
    const sub = await this.subByRef(subRef);
    const detail = await this.d.iyzico.retrieveSubscription(subRef);
    const order = detail.orders.find((o) => o.referenceCode === orderRef);
    if (!order) throw new BillingError(404, 'order_not_found');
    if (order.paymentStatus === 'SUCCESS') await this.renew(sub, orderRef, order.price);
    else await this.failRenewal(sub, orderRef);
    await this.s.saveSubscription(sub);
    return sub;
  }

  private async renew(sub: Subscription, orderRef: string, priceKurus: number) {
    const paymentId = `subpay-${orderRef}`;
    if (await this.s.findCharge(paymentId)) return;
    const product = findProduct(this.table(), sub.planCode);
    const months = product?.interval === 'yillik' ? 12 : 1;
    sub.currentPeriodStart = sub.currentPeriodEnd;
    sub.currentPeriodEnd = addMonths(sub.currentPeriodStart, months);
    sub.status = 'aktif';
    sub.grantsDelivered = 0;
    sub.firstFailureAt = null;
    sub.failedRetries = 0;
    sub.failedOrderRef = null;
    sub.lastPaymentId = paymentId;
    sub.priceKurus = priceKurus;
    if (sub.pendingPrice && sub.pendingPrice.effectiveAt.getTime() <= sub.currentPeriodStart.getTime())
      sub.pendingPrice = null;
    await this.s.saveSubscription(sub);
    await this.s.addPayment({
      orderId: null,
      subscriptionId: sub.id,
      providerPaymentId: paymentId,
      refundRef: null,
      amountKurus: priceKurus,
      kind: 'odeme',
      at: this.d.now(),
    });
    await this.s.setPlan(sub.userId, sub.planCode);
    await this.grantMonth(sub, orderRef);
    await this.invoice(sub.userId, null, 'satis', priceKurus, PLAN_NAMES[sub.planCode] ?? sub.planCode);
    await this.scheduleRenewalNotices(sub);
  }

  private async failRenewal(sub: Subscription, orderRef: string) {
    if (sub.failedOrderRef === orderRef) return;
    sub.status = 'odeme_bekliyor';
    sub.firstFailureAt = this.d.now();
    sub.failedRetries = 0;
    sub.failedOrderRef = orderRef;
    await this.notify(sub.userId, 'odeme_basarisiz', this.d.now(), orderRef);
  }

  /** Dunning tick (4.5/10): retry on day 1, 3, 7; after the third failure drop to Ucretsiz, credits stay. */
  async runDunning(): Promise<void> {
    const now = this.d.now();
    for (const sub of await this.s.listSubscriptions()) {
      if (sub.status !== 'odeme_bekliyor' || !sub.firstFailureAt || !sub.failedOrderRef) continue;
      const step = nextDunningStep(sub.firstFailureAt, sub.failedRetries);
      if (step.at.getTime() > now.getTime()) continue;
      if (step.action === 'downgrade') {
        sub.status = 'sona_erdi';
        await this.s.setPlan(sub.userId, 'ucretsiz');
        await this.d.iyzico.cancelSubscription(sub.providerRef);
        await this.notify(sub.userId, 'plan_ucretsize_indi', now, sub.id);
      } else {
        const r = await this.d.iyzico.retrySubscriptionOrder(sub.failedOrderRef);
        if (r.status === 'success') {
          const detail = await this.d.iyzico.retrieveSubscription(sub.providerRef);
          const o = detail.orders.find((x) => x.referenceCode === sub.failedOrderRef);
          await this.renew(sub, sub.failedOrderRef, o?.price ?? sub.priceKurus);
        } else {
          sub.failedRetries += 1;
        }
      }
      await this.s.saveSubscription(sub);
    }
  }

  /** POST /v1/subscriptions/{id}/cancel: one step, default at period end. */
  async cancel(
    userId: string,
    subId: string,
    mode: 'donem_sonu' | 'hemen',
  ): Promise<{ status: string; refundAmountKurus?: number }> {
    const sub = await this.s.getSubscription(subId);
    if (!sub || sub.userId !== userId) throw new BillingError(404, 'subscription_not_found');
    if (sub.status === 'iptal' || sub.status === 'sona_erdi') throw new BillingError(409, 'already_canceled');
    const product = findProduct(this.table(), sub.planCode);
    const now = this.d.now();
    const paid = sub.lastPaymentId ? await this.s.findCharge(sub.lastPaymentId) : null;
    const decision = decideCancel(
      {
        interval: product?.interval ?? 'aylik',
        status: sub.status === 'odeme_bekliyor' ? 'odeme_bekliyor' : 'aktif',
        paidKurus: paid?.amountKurus ?? sub.priceKurus,
        monthlyListKurus: product?.monthlyListKurus ?? 0,
        grantsDelivered: sub.grantsDelivered,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      },
      mode,
      now,
    );
    // No further charges at iyzico in either mode; entitlement stays until the period end for donem_sonu.
    await this.d.iyzico.cancelSubscription(sub.providerRef);
    sub.cancelAtPeriodEnd = decision.cancelAtPeriodEnd;
    sub.canceledAt = now;
    await this.s.dropRenewalNotices(sub.userId, sub.id);
    if (mode === 'hemen') {
      sub.status = 'iptal';
      sub.currentPeriodEnd = now;
      await this.s.setPlan(sub.userId, 'ucretsiz');
      if (decision.refundAmountKurus > 0 && sub.lastPaymentId) {
        await this.d.iyzico.refund({
          paymentId: sub.lastPaymentId,
          priceKurus: decision.refundAmountKurus,
          conversationId: sub.id,
          ip: '0.0.0.0',
        });
        await this.s.addPayment({
          orderId: null,
          subscriptionId: sub.id,
          providerPaymentId: sub.lastPaymentId,
          refundRef: `fesih:${sub.id}`,
          amountKurus: decision.refundAmountKurus,
          kind: 'iade',
          at: now,
        });
        await this.invoice(sub.userId, null, 'iade', decision.refundAmountKurus, 'Yıllık plan iadesi');
      }
    }
    await this.s.saveSubscription(sub);
    await this.notify(sub.userId, 'fesih_teyidi', now, sub.id);
    return {
      status: mode === 'hemen' ? 'iptal' : 'donem_sonunda_bitecek',
      refundAmountKurus: decision.refundAmountKurus,
    };
  }

  /** Ends subscriptions whose period is over after a donem_sonu cancellation. */
  async closeEndedPeriods(): Promise<void> {
    const now = this.d.now();
    for (const sub of await this.s.listSubscriptions()) {
      if (
        sub.cancelAtPeriodEnd &&
        sub.status === 'aktif' &&
        sub.currentPeriodEnd.getTime() <= now.getTime()
      ) {
        sub.status = 'sona_erdi';
        await this.s.saveSubscription(sub);
        await this.s.setPlan(sub.userId, 'ucretsiz');
      }
    }
  }

  /** POST /v1/refund-requests for a package: 14 days and unused means full refund (4.5/4). */
  async refundPackage(userId: string, orderId: string): Promise<{ refunded: boolean; amountKurus: number }> {
    const order = await this.s.getOrder(orderId);
    if (!order || order.userId !== userId) throw new BillingError(404, 'order_not_found');
    if (order.status !== 'odendi' || !order.paymentId || !order.paidAt)
      throw new BillingError(409, 'not_refundable');
    const walletId = await this.s.walletOf(userId);
    const now = this.d.now();
    await this.d.ledger.run(walletId, (l) => {
      const lot = l.wallet(walletId).lots.find((x) => x.originRef === `order:${order.id}`);
      if (
        !lot ||
        !packageRefundAllowed({
          purchasedAt: order.paidAt as Date,
          now,
          originalCredits: lot.originalCredits,
          remainingCredits: lot.remainingCredits,
        })
      )
        throw new BillingError(409, 'not_refundable');
      l.refundUnusedLot({ key: `iade:order:${order.id}`, walletId, originRef: `order:${order.id}`, now });
    });
    await this.d.iyzico.refund({
      paymentId: order.paymentId,
      priceKurus: order.amountKurus,
      conversationId: order.id,
      ip: '0.0.0.0',
    });
    order.status = 'iade_edildi';
    await this.s.saveOrder(order);
    await this.s.addPayment({
      orderId: order.id,
      subscriptionId: null,
      providerPaymentId: order.paymentId,
      refundRef: `paket:${order.id}`,
      amountKurus: order.amountKurus,
      kind: 'iade',
      at: now,
    });
    await this.invoice(userId, order.id, 'iade', order.amountKurus, 'Kredi paketi iadesi');
    return { refunded: true, amountKurus: order.amountKurus };
  }

  /** Chargeback reported by iyzico (panel or report): claw back the order's credits (4.5/11). */
  async chargeback(orderId: string, caseRef: string): Promise<number> {
    const order = await this.s.getOrder(orderId);
    if (!order) throw new BillingError(404, 'order_not_found');
    const walletId = await this.s.walletOf(order.userId);
    return this.d.ledger.run(walletId, (l) => {
      l.clawback({
        key: `ters_ibraz:${caseRef}`,
        walletId,
        originRef: `order:${order.id}`,
        reason: 'ters_ibraz',
        now: this.d.now(),
      });
      return l.balance(walletId);
    });
  }

  /** billing.monthly_grant: annual plans receive their monthly credits while active (9.2/3). */
  async monthlyGrant(): Promise<number> {
    const now = this.d.now();
    let n = 0;
    for (const sub of await this.s.listSubscriptions()) {
      const product = findProduct(this.table(), sub.planCode);
      if (product?.interval !== 'yillik' || sub.status !== 'aktif') continue;
      const due = Math.min(
        annualGrantsDue(sub.currentPeriodStart, now),
        annualGrantsDue(sub.currentPeriodStart, sub.currentPeriodEnd),
      );
      while (sub.grantsDelivered < due) {
        await this.grantMonth(sub, `ay${sub.grantsDelivered + 1}`);
        await this.s.saveSubscription(sub);
        n++;
      }
    }
    return n;
  }

  /** billing.reconcile: compare iyzico's daily report with recorded payments; differences raise an alert. */
  async reconcileDay(date: Date): Promise<ReconDiff[]> {
    const provider = (await this.d.iyzico.listTransactions(date)).map((t) => ({
      paymentId: t.paymentId,
      kind: t.kind,
      amountKurus: t.amountKurus,
    }));
    const recorded = (await this.s.paymentsOn(day(date))).map((p) => ({
      paymentId: p.providerPaymentId,
      kind: p.kind,
      amountKurus: p.amountKurus,
    }));
    const diffs = reconcile(provider, recorded);
    if (diffs.length) await this.s.alert('mutabakat_farki', { day: day(date), diffs });
    return diffs;
  }

  /** 4.5/9: notify every active subscriber of a plan now; the new price applies from a period >= 30 days away. */
  async announcePriceChange(planCode: string, newPriceKurus: number): Promise<number> {
    const now = this.d.now();
    let n = 0;
    for (const sub of await this.s.listSubscriptions()) {
      if (sub.planCode !== planCode || sub.status !== 'aktif' || sub.cancelAtPeriodEnd) continue;
      const product = findProduct(this.table(), planCode);
      const months = product?.interval === 'yillik' ? 12 : 1;
      const starts = [1, 2, 3].map((k) => addMonths(sub.currentPeriodStart, months * k));
      const effectiveAt = priceChangeEffectiveAt({ noticeSentAt: now, nextPeriodStarts: starts });
      if (!effectiveAt) continue;
      sub.pendingPrice = { priceKurus: newPriceKurus, effectiveAt };
      await this.s.saveSubscription(sub);
      await this.notify(sub.userId, 'fiyat_degisikligi', now, `${sub.id}:${effectiveAt.toISOString()}`);
      n++;
    }
    return n;
  }

  /** Redeem a credit coupon as a 90 day promotional lot, once per coupon and user. */
  async redeemCoupon(userId: string, code: string): Promise<number> {
    const normalized = normalizeCouponCode(code);
    const c = await this.s.getCoupon(normalized);
    const check = checkCoupon(c, this.d.now());
    if (!check.ok || check.kind !== 'kredi' || !c) throw new BillingError(400, 'invalid_coupon');
    const walletId = await this.s.walletOf(userId);
    const key = `kupon:${c.code}:${userId}`;
    const tx = await this.d.ledger.run(walletId, (l) =>
      l.grant({
        key,
        walletId,
        source: 'promosyon',
        credits: check.credits,
        originRef: key,
        now: this.d.now(),
      }),
    );
    await this.s.redeemCoupon(c.code, userId, { ledgerTransactionId: tx.id });
    return check.credits;
  }

  /* Wallet views (contracts Wallet, LedgerMovement, Invoice) */

  async wallet(userId: string) {
    const walletId = await this.s.walletOf(userId);
    return this.d.ledger.run(walletId, (l) => {
      const now = this.d.now();
      l.expirePromos(walletId, now);
      l.sweepExpired(walletId, now);
      return {
        balance: l.balance(walletId),
        reserved: l.reserved(walletId),
        dailyFreeRemaining: 0,
        lots: l
          .wallet(walletId)
          .lots.filter((x) => x.remainingCredits > 0)
          .map((x) => ({
            source: x.source,
            remaining: x.remainingCredits,
            expiresAt: x.expiresAt ? x.expiresAt.toISOString() : null,
          })),
      };
    });
  }

  async movements(userId: string) {
    const walletId = await this.s.walletOf(userId);
    const txs = await this.d.ledger.movements(walletId);
    return txs.flatMap((t) => toMovement(t, walletId)).reverse();
  }

  async invoices(userId: string) {
    return (await this.s.listInvoices(userId)).map((i) => ({
      id: i.id,
      number: i.number,
      issuedAt: i.issuedAt.toISOString(),
      totalKurus: i.totalKurus,
      pdfUrl: null,
    }));
  }
}

const MOVEMENT_KIND: Partial<
  Record<LedgerTx['kind'], 'yukleme' | 'tuketim' | 'iade' | 'ters_kayit' | 'son_kullanma'>
> = {
  yukleme: 'yukleme',
  rezervasyon_tuketim: 'tuketim',
  iade: 'iade',
  ters_ibraz: 'ters_kayit',
  apple_iade: 'ters_kayit',
  son_kullanma: 'son_kullanma',
};

/** Net effect on the user: held and released reservations are hidden, consumption shows the charge. */
export function toMovement(t: LedgerTx, walletId: string) {
  const kind = MOVEMENT_KIND[t.kind];
  if (!kind) return [];
  const credits =
    t.kind === 'rezervasyon_tuketim'
      ? -t.entries.filter((e) => e.accountCode === ACCOUNTS.consumption).reduce((s, e) => s + e.credits, 0)
      : t.entries
          .filter((e) => e.accountCode === ACCOUNTS.wallet(walletId))
          .reduce((s, e) => s + (e.side === 'alacak' ? e.credits : -e.credits), 0);
  return [{ id: t.id, at: t.at.toISOString(), credits, kind, description: null }];
}

export { LedgerError };
