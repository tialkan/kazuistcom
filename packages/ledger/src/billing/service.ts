/**
 * Billing service (plan 9.2, 4.5): checkout, server side re-query, webhooks, subscriptions, dunning,
 * cancellation, refunds, chargeback, monthly grants, reconciliation and notices.
 *
 * Ordering rules (audit Y2, Y3, Y6): local state is written before a provider call; every refund row is
 * written as bekliyor first and the provider is called at most once per refund_ref; side effects that
 * must happen once (invoice, notice) run only for the caller whose insert or status change won.
 */
import { createHash } from 'node:crypto';
import {
  ACCOUNTS,
  LedgerError,
  PRICE_TABLE_V1,
  RETRY_DAYS,
  addMonths,
  annualGrantsDue,
  applyDiscount,
  checkCoupon,
  decideCancel,
  dueToday,
  istanbulDay,
  addBusinessDays,
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
  IyzicoError,
  isSubscriptionWebhook,
  successfulPaymentId,
  verifyWebhookSignature,
  type CheckoutInit,
  type IyzicoApi,
  type IyzicoConfig,
  type IyzicoWebhook,
} from './iyzico.ts';
import {
  planRole,
  type BillingStore,
  type Consent,
  type LedgerPort,
  type Order,
  type PreparedLegalDocument,
  type Subscription,
} from './store.ts';

export class BillingError extends Error {
  constructor(
    public readonly status: 400 | 401 | 402 | 404 | 409 | 502,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'BillingError';
  }
}

/** Published versions of the legal texts (content/hukuki front matter `version`), checked on every consent (O5). */
export interface ConsentVersions {
  on_bilgilendirme: string;
  mesafeli_sozlesme: string;
  abonelik_sozlesmesi: string;
}

export interface BillingDeps {
  iyzico: IyzicoApi;
  iyzicoCfg: Pick<IyzicoConfig, 'secretKey' | 'merchantId'>;
  earsiv: EArsivProvider;
  store: BillingStore;
  ledger: LedgerPort;
  /** Required in production (context reads content/hukuki); without it only non empty versions are checked. */
  consentVersions?: ConsentVersions;
  priceTables?: PriceTable[];
  prepareLegalDocuments?: (
    order: Readonly<Order>,
    buyer: Buyer,
    table: PriceTable,
  ) => readonly PreparedLegalDocument[] | Promise<readonly PreparedLegalDocument[]>;
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
const PLAN_RANK: Record<string, number> = { ucretsiz: 0, plus: 1, akademisyen: 2 };

/** Signup gift (plan 4.2): 50 promotional credits, 90 days. */
export const SIGNUP_PROMO_CREDITS = 50;

/** iyzico error codes meaning "no payment for this token yet" (sandbox answers of 2026-10-25). */
const NOT_PAID_YET = new Set(['5122', '5124']);
// Explicit bank rejections verified in docs.iyzico.com/ek-bilgiler/hata-kodlari.
// Never infer rejection from a numeric range or a generic status failure.
const PAYMENT_DECLINED = new Set(['10051', '10005']);

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

export interface ReconcileResult {
  disabled: boolean;
  diffs: ReconDiff[];
}

export class BillingService {
  constructor(private readonly d: BillingDeps) {}

  private get s(): BillingStore {
    return this.d.store;
  }

  private table(at: Date = this.d.now()): PriceTable {
    const t = effectiveTable(this.d.priceTables ?? [PRICE_TABLE_V1], at);
    if (!t) throw new BillingError(409, 'no_price_table');
    return t;
  }

  prices(): PriceTable {
    return this.table();
  }

  /** Define iyzico subscription product and pricing plans (9.2/2). Idempotent per planCode. */
  async setupSubscriptionCatalog(): Promise<Map<string, string>> {
    const refs = await this.s.planRefs(this.table().version);
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
      await this.s.savePlanRef(p.code, r.referenceCode, this.table().version);
      refs.set(p.code, r.referenceCode);
    }
    return refs;
  }

  private consents(
    userId: string,
    items: [Consent['kind'], string, boolean][],
    ctx: Consent['context'],
  ): Consent[] {
    const at = this.d.now();
    return items.map(([kind, version, granted]) => ({
      userId,
      kind,
      version,
      granted,
      context: { ...ctx, channel: 'web' },
      at,
    }));
  }

  private checkVersions(
    preInfo: string,
    contract: string,
    contractKind: 'mesafeli_sozlesme' | 'abonelik_sozlesmesi',
  ) {
    if (!preInfo || !contract) throw new BillingError(400, 'consent_required');
    const v = this.d.consentVersions;
    if (v && (preInfo !== v.on_bilgilendirme || contract !== v[contractKind]))
      throw new BillingError(400, 'consent_version_mismatch');
  }

  private async replay(userId: string, key: string, requestHash: string) {
    const existing = await this.s.findOrderByKey(userId, key);
    if (!existing) return null;
    if (existing.consentVersions.requestHash !== requestHash)
      throw new BillingError(409, 'idempotency_key_reused');
    if (existing.status === 'basarisiz') throw new BillingError(409, 'order_failed');
    return {
      orderId: existing.id,
      checkoutFormContent: existing.consentVersions.form as string,
      paymentPageUrl: (existing.consentVersions.pageUrl as string | undefined) ?? null,
    };
  }

  /**
   * POST /v1/checkout/topup. Confirmation and withdrawal exception boxes are required; coupon, consent
   * versions and replay are checked before the order is written (Y4, O5, D3).
   */
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
    const couponCode = input.couponCode ? normalizeCouponCode(input.couponCode) : null;
    const requestHash = hash({
      p: input.productCode,
      c: couponCode,
      v: [input.preInfoConsentVersion, input.distanceContractConsentVersion],
      w: input.withdrawalWaiver,
    });
    const again = await this.replay(userId, idempotencyKey, requestHash);
    if (again) return again;
    this.checkVersions(
      input.preInfoConsentVersion,
      input.distanceContractConsentVersion,
      'mesafeli_sozlesme',
    );
    if (!input.withdrawalWaiver) throw new BillingError(400, 'withdrawal_waiver_required');
    const product = findProduct(this.table(), input.productCode);
    if (!product || product.kind !== 'paket') throw new BillingError(400, 'unknown_product');
    let amount = product.priceKurus;
    if (couponCode) {
      const c = checkCoupon(await this.s.getCoupon(couponCode), this.d.now());
      if (!c.ok && c.reason === 'tukendi') throw new BillingError(409, 'coupon_exhausted');
      if (!c.ok || c.kind !== 'indirim') throw new BillingError(400, 'invalid_coupon');
      if (await this.s.hasRedeemed(couponCode, userId)) throw new BillingError(409, 'coupon_already_used');
      if (!(await this.s.claimCouponSlot(couponCode))) throw new BillingError(409, 'coupon_exhausted');
      amount = applyDiscount(amount, c.percentOff);
    }
    const orderId = this.d.newId();
    try {
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
          requestHash,
          form: '',
        },
        checkoutToken: null,
        paymentId: null,
        createdAt: this.d.now(),
        paidAt: null,
      };
      const documents =
        (await this.d.prepareLegalDocuments?.(order, buyer, this.table(order.createdAt))) ?? [];
      const init = await this.d.iyzico.initCheckoutForm({
        conversationId: orderId,
        basketId: orderId,
        priceKurus: amount,
        paidPriceKurus: amount,
        callbackUrl: `${this.d.callbackBaseUrl}/api/v1/checkout/callback`,
        buyer,
        item: { id: product.code, name: `Kazuist ${product.credits} kredi`, category: 'Dijital hizmet' },
      });
      // Consents only for a checkout that iyzico opened (D-N1), still before the order row (Y4).
      const consentRows = this.consents(
        userId,
        [
          ['on_bilgilendirme', input.preInfoConsentVersion, true],
          ['mesafeli_sozlesme', input.distanceContractConsentVersion, true],
          ['cayma_istisnasi', input.distanceContractConsentVersion, input.withdrawalWaiver],
        ],
        { orderId, productCode: product.code },
      );
      order.checkoutToken = init.token;
      order.consentVersions.form = init.checkoutFormContent;
      if (init.paymentPageUrl) order.consentVersions.pageUrl = init.paymentPageUrl;
      await this.s.saveCheckout(order, consentRows, documents);
      if (couponCode && !(await this.s.recordRedemption(couponCode, userId, { orderId }))) {
        order.status = 'basarisiz';
        await this.s.saveOrder(order);
        throw new BillingError(409, 'coupon_already_used');
      }
      await this.notify(userId, 'sozlesme', this.d.now(), orderId);
      return { orderId, checkoutFormContent: init.checkoutFormContent, paymentPageUrl: init.paymentPageUrl };
    } catch (e) {
      if (couponCode) await this.s.releaseCouponSlot(couponCode);
      throw e;
    }
  }

  /**
   * Callback and webhook both land here: the token is re-queried at iyzico and only a SUCCESS with
   * fraudStatus 1, matching basket, amount and currency grants credits (O4). fraudStatus 0 waits for the
   * next notification. Concurrent calls grant once and invoice once (Y6).
   */
  async completeCheckout(token: string): Promise<Order> {
    const order = await this.s.findOrderByToken(token);
    if (!order) throw new BillingError(404, 'order_not_found');
    if (order.status === 'odendi' || order.status === 'iade_edildi') return order;
    let r;
    try {
      r = await this.d.iyzico.retrieveCheckoutForm(token);
    } catch (e) {
      // Sandbox, 2026-10-25 (fixtures/iyzico-sandbox.json): a token whose form was never paid answers
      // status failure with errorCode 5122 (5124: unknown token). That is not a failed payment yet; the
      // recheck job closes it after 2 days.
      if (e instanceof IyzicoError && e.definite && NOT_PAID_YET.has(e.errorCode ?? '')) return order;
      // Only verified rejection codes close the order; technical/unknown errors are retried and alerted.
      if (e instanceof IyzicoError && e.definite && PAYMENT_DECLINED.has(e.errorCode ?? '')) {
        await this.failOrder(order);
        return order;
      }
      throw e;
    }
    if (r.status !== 'success' || r.paymentStatus !== 'SUCCESS' || r.paymentId === null) {
      if (r.paymentStatus === 'FAILURE') await this.failOrder(order);
      return order;
    }
    if (r.fraudStatus === -1) {
      await this.failOrder(order);
      return order;
    }
    // 1 approved, 2 approved after review; 0 stays pending and is re-queried by recheckPendingOrders (Y-N3).
    if (r.fraudStatus !== 1 && r.fraudStatus !== 2) {
      // Paid, in fraud review: tracked as inceleniyor with its paymentId for the IFN and the recheck job.
      if (order.status !== 'inceleniyor' || order.paymentId !== r.paymentId) {
        order.status = 'inceleniyor';
        order.paymentId = r.paymentId;
        await this.s.saveOrder(order);
      }
      return order;
    }
    if (
      r.basketId !== order.id ||
      r.paidPriceKurus !== order.amountKurus ||
      (r.currency ?? 'TRY') !== 'TRY'
    ) {
      await this.s.alert('odeme_uyusmazligi', {
        orderId: order.id,
        paymentId: r.paymentId,
        expectedKurus: order.amountKurus,
        paidKurus: r.paidPriceKurus,
        currency: r.currency,
      });
      return order;
    }
    const product = findProduct(this.table(order.createdAt), order.productCode);
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
    order.paidAt = order.paidAt ?? this.d.now();
    await this.s.saveOrder(order);
    const won = await this.s.addPayment({
      orderId: order.id,
      subscriptionId: null,
      providerPaymentId: r.paymentId,
      refundRef: null,
      amountKurus: order.amountKurus,
      kind: 'odeme',
      status: 'basarili',
      at: this.d.now(),
    });
    if (won) {
      await this.invoice(order.userId, order.id, 'satis', order.amountKurus, `Kazuist ${credits} kredi`);
      await this.notify(order.userId, 'odeme_alindi', this.d.now(), `${order.id}:${order.amountKurus}`);
    }
    return order;
  }

  /** A failed payment gives its coupon use back (O-N2). */
  private async failOrder(order: Order): Promise<void> {
    if (order.status === 'basarisiz') return;
    order.status = 'basarisiz';
    await this.s.saveOrder(order);
    if (order.couponCode) {
      await this.s.deleteRedemption(order.couponCode, order.userId);
      await this.s.releaseCouponSlot(order.couponCode);
    }
  }

  /**
   * Recheck job (Y-N3, Y-N4): orders of the last 7 days still waiting for a result are re-queried at
   * iyzico by token: a fraud review that ended (fraudStatus 2), a paid subscription whose browser callback
   * never came. Orders older than 2 days without a payment are closed. Returns how many got paid.
   */
  async recheckPendingOrders(kind: 'all' | 'abonelik' = 'all'): Promise<number> {
    const now = this.d.now().getTime();
    let paid = 0;
    for (const o of await this.s.listPendingOrders(new Date(now - 7 * 86_400_000))) {
      const product = findProduct(this.table(o.createdAt), o.productCode);
      if (!product || !o.checkoutToken) continue;
      if (kind === 'abonelik' && product.kind !== 'abonelik') continue;
      const token = o.checkoutToken;
      await this.isolate('yeniden_sorgu_hatasi', { orderId: o.id }, async () => {
        try {
          if (product.kind === 'abonelik') {
            await this.completeSubscriptionCheckout(token);
            paid++;
            return;
          }
          if ((await this.completeCheckout(token)).status === 'odendi') {
            paid++;
            return;
          }
        } catch (e) {
          if (!(e instanceof BillingError)) throw e;
        }
        // Only an order without a payment is closed after 2 days; a paid order in fraud review stays
        // inceleniyor until iyzico decides (Y-N5).
        const fresh = await this.s.getOrder(o.id);
        if (fresh?.status === 'bekliyor' && now - o.createdAt.getTime() > 2 * 86_400_000)
          await this.failOrder(fresh);
      });
    }
    return paid;
  }

  /**
   * IFN (fraud review notification, Y-N3). Until its signature format is verified the body is only a
   * trigger: the order it names is re-queried at iyzico and nothing is taken from the body itself.
   */
  async handleFraudNotification(rawBody: string): Promise<{ status: 200 | 400 }> {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { status: 400 };
    }
    // Documented IFN body: { paymentId, fraudStatus } (O-N3). Only an order already waiting in fraud review
    // with that paymentId is re-queried; any other body triggers nothing.
    const pid = body?.paymentId;
    if ((typeof pid !== 'number' && typeof pid !== 'string') || String(pid).length > 30)
      return { status: 200 };
    const order = await this.s.findOrderByPaymentId(String(pid));
    if (order?.status === 'inceleniyor' && order.checkoutToken)
      await this.completeCheckout(order.checkoutToken);
    return { status: 200 };
  }

  /** e-Arsiv failure never undoes a payment; it raises fatura_bekliyor for the accountant (D5). */
  private async invoice(
    userId: string,
    orderId: string | null,
    kind: 'satis' | 'iade',
    totalKurus: number,
    description: string,
  ) {
    try {
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
      const fresh = await this.s.addInvoice({
        id: this.d.newId(),
        userId,
        orderId,
        number: inv.number,
        kind,
        totalKurus,
        providerRef: inv.providerRef,
        issuedAt: inv.issuedAt,
      });
      if (!fresh) await this.s.alert('fatura_numarasi_cakisti', { number: inv.number, orderId, kind });
    } catch (e) {
      await this.s.alert('fatura_bekliyor', {
        userId,
        orderId,
        kind,
        totalKurus,
        error: e instanceof Error ? e.name : 'Error',
      });
    }
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
    input: {
      planCode: string;
      couponCode?: string;
      preInfoConsentVersion: string;
      distanceContractConsentVersion: string;
      withdrawalWaiver?: boolean;
      annualCommitmentVersion?: string;
    },
    buyer: Buyer,
  ) {
    const requestHash = hash({
      p: input.planCode,
      c: input.couponCode ?? null,
      v: [input.preInfoConsentVersion, input.distanceContractConsentVersion],
      w: input.withdrawalWaiver ?? null,
      annual: input.annualCommitmentVersion ?? null,
    });
    const again = await this.replay(userId, idempotencyKey, requestHash);
    if (again) return again;
    // Coupons on plans are not defined yet (O5): refuse instead of silently ignoring.
    if (input.couponCode) throw new BillingError(400, 'coupon_not_supported');
    const product = findProduct(this.table(), input.planCode);
    const planRef = (await this.s.planRefs(this.table().version)).get(input.planCode);
    if (!product || product.kind !== 'abonelik' || !planRef) throw new BillingError(400, 'unknown_plan');
    this.checkVersions(
      input.preInfoConsentVersion,
      input.distanceContractConsentVersion,
      'abonelik_sozlesmesi',
    );
    if (!input.withdrawalWaiver) throw new BillingError(400, 'withdrawal_waiver_required');
    if (
      product.interval === 'yillik' &&
      input.annualCommitmentVersion !== input.distanceContractConsentVersion
    )
      throw new BillingError(400, 'annual_commitment_version_mismatch');
    const orderId = this.d.newId();
    // The annual commitment is an integral section of the same published abonelik text.
    // Subscription step: abonelik_sozlesmesi, yillik_taahhutname for annual plans (ADR-0023) and the
    // withdrawal exception box until Tarik decides the unused first period case.
    const items: [Consent['kind'], string, boolean][] = [
      ['on_bilgilendirme', input.preInfoConsentVersion, true],
      ['abonelik_sozlesmesi', input.distanceContractConsentVersion, true],
    ];
    if (product.interval === 'yillik')
      items.push(['yillik_taahhutname', input.annualCommitmentVersion as string, true]);
    items.push(['cayma_istisnasi', input.distanceContractConsentVersion, true]);
    const order: Order = {
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
        requestHash,
        form: '',
      },
      checkoutToken: null,
      paymentId: null,
      createdAt: this.d.now(),
      paidAt: null,
    };
    const documents = (await this.d.prepareLegalDocuments?.(order, buyer, this.table(order.createdAt))) ?? [];
    const init = await this.d.iyzico.initSubscriptionCheckout({
      conversationId: orderId,
      pricingPlanReferenceCode: planRef,
      callbackUrl: `${this.d.callbackBaseUrl}/api/v1/checkout/subscription-callback`,
      customer: buyer,
    });
    // Consents only for a checkout that iyzico opened (D-N1).
    const consentRows = this.consents(userId, items, { orderId, productCode: product.code });
    order.checkoutToken = init.token;
    order.consentVersions.form = init.checkoutFormContent;
    if (init.paymentPageUrl) order.consentVersions.pageUrl = init.paymentPageUrl;
    await this.s.saveCheckout(order, consentRows, documents);
    await this.notify(userId, 'sozlesme', this.d.now(), orderId);
    return { orderId, checkoutFormContent: init.checkoutFormContent, paymentPageUrl: init.paymentPageUrl };
  }

  /**
   * Subscription checkout callback: re-query, create the subscription and deliver the first grant. The
   * first order's real paymentId (paymentAttempts) is stored as the charge, so the webhook iyzico sends
   * for that same order is recognised and not treated as a renewal (K2, Y1).
   */
  async completeSubscriptionCheckout(token: string): Promise<Subscription> {
    const order = await this.s.findOrderByToken(token);
    if (!order) throw new BillingError(404, 'order_not_found');
    const r = await this.d.iyzico.retrieveSubscriptionCheckout(token);
    if (r.status !== 'success' || !r.subscriptionReferenceCode)
      throw new BillingError(402, 'subscription_failed');
    const ref = r.subscriptionReferenceCode;
    const found = await this.s.findSubscriptionByRef(ref);
    if (found) return found;
    const detail = await this.d.iyzico.retrieveSubscription(ref);
    const first = detail.orders[0];
    const paymentId = successfulPaymentId(first);
    if (!first || !paymentId) throw new BillingError(409, 'payment_pending');
    const product = findProduct(this.table(order.createdAt), order.productCode);
    if (!product) throw new BillingError(400, 'unknown_plan');
    const now = this.d.now();
    const sub: Subscription = {
      id: this.d.newId(),
      userId: order.userId,
      planCode: product.code,
      productId: order.productId,
      providerRef: ref,
      status: 'aktif',
      priceKurus: first.price,
      currentPeriodStart: now,
      currentPeriodEnd: addMonths(now, product.interval === 'yillik' ? 12 : 1),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      grantsDelivered: 0,
      lastPaymentId: paymentId,
      firstFailureAt: null,
      failedRetries: 0,
      failedOrderRef: null,
      pendingPrice: null,
    };
    await this.s.saveSubscription(sub);
    order.status = 'odendi';
    order.paidAt = now;
    order.paymentId = paymentId;
    await this.s.saveOrder(order);
    const won = await this.s.addPayment({
      orderId: order.id,
      subscriptionId: sub.id,
      providerPaymentId: paymentId,
      refundRef: null,
      amountKurus: first.price,
      kind: 'odeme',
      status: 'basarili',
      at: now,
    });
    await this.recomputePlan(sub.userId);
    if (won) {
      await this.grantMonth(sub, 'ilk');
      await this.invoice(
        sub.userId,
        order.id,
        'satis',
        first.price,
        PLAN_NAMES[product.code] ?? product.code,
      );
      await this.scheduleRenewalNotices(sub);
      await this.s.saveSubscription(sub);
    }
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
    const price =
      sub.pendingPrice && sub.pendingPrice.effectiveAt.getTime() <= sub.currentPeriodEnd.getTime()
        ? sub.pendingPrice.priceKurus
        : sub.priceKurus;
    // ref: <subscription>:<kurus>:<charge date>, read by the notice text renderer (Y5).
    for (const n of renewalNotices(sub.currentPeriodEnd, product?.interval ?? 'aylik'))
      await this.notify(
        sub.userId,
        n.kind,
        n.sendAt,
        `${sub.id}:${price}:${sub.currentPeriodEnd.toISOString()}`,
      );
  }

  /** Plan entitlement from every live subscription of the user, highest wins (O7). */
  async recomputePlan(userId: string): Promise<void> {
    const now = this.d.now().getTime();
    let best: string = 'ucretsiz';
    for (const s of await this.s.listSubscriptions(userId)) {
      const live =
        (s.status === 'aktif' || s.status === 'odeme_bekliyor') && s.currentPeriodEnd.getTime() > now;
      if (live && (PLAN_RANK[planRole(s.planCode)] ?? 0) > (PLAN_RANK[planRole(best)] ?? 0))
        best = s.planCode;
    }
    await this.s.setPlan(userId, best);
  }

  private async subByRef(ref: string): Promise<Subscription> {
    const s = await this.s.findSubscriptionByRef(ref);
    if (!s) throw new BillingError(404, 'subscription_not_found');
    return s;
  }

  /**
   * Renewal or failed renewal, from the webhook; the order is re-queried at iyzico and read the way the
   * documentation describes it: orders[].orderStatus and the successful paymentAttempts[].paymentId (K1).
   */
  async onSubscriptionOrder(subRef: string, orderRef: string): Promise<Subscription> {
    // A paid subscription whose browser callback never came is opened from its pending order (Y-N4).
    if (!(await this.s.findSubscriptionByRef(subRef))) await this.recheckPendingOrders('abonelik');
    const sub = await this.subByRef(subRef);
    const detail = await this.d.iyzico.retrieveSubscription(subRef);
    const order = detail.orders.find((o) => o.referenceCode === orderRef);
    if (!order) throw new BillingError(404, 'order_not_found');
    if (order.orderStatus === 'SUCCESS') {
      const paymentId = successfulPaymentId(order);
      if (!paymentId) throw new BillingError(409, 'payment_pending');
      // The first order (or a replay) is already recorded as a charge: nothing to renew (K2).
      if (!(await this.s.findCharge(paymentId))) await this.renew(sub, orderRef, paymentId, order.price);
    } else if (order.orderStatus === 'FAILED') await this.failRenewal(sub, orderRef);
    await this.s.saveSubscription(sub);
    return sub;
  }

  private async renew(sub: Subscription, orderRef: string, paymentId: string, priceKurus: number) {
    const won = await this.s.addPayment({
      orderId: null,
      subscriptionId: sub.id,
      providerPaymentId: paymentId,
      refundRef: null,
      amountKurus: priceKurus,
      kind: 'odeme',
      status: 'basarili',
      at: this.d.now(),
    });
    if (!won) return;
    if (sub.status === 'iptal' || sub.status === 'sona_erdi' || sub.cancelAtPeriodEnd) {
      // A charge after cancellation must not happen (O2); it is recorded and raised for a refund.
      await this.s.alert('iptal_sonrasi_tahsilat', { subscriptionId: sub.id, paymentId, priceKurus });
      return;
    }
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
    await this.recomputePlan(sub.userId);
    await this.grantMonth(sub, orderRef);
    await this.invoice(sub.userId, null, 'satis', priceKurus, PLAN_NAMES[sub.planCode] ?? sub.planCode);
    await this.scheduleRenewalNotices(sub);
  }

  private async failRenewal(sub: Subscription, orderRef: string) {
    if (sub.failedOrderRef === orderRef || sub.cancelAtPeriodEnd || sub.status !== 'aktif') return;
    sub.status = 'odeme_bekliyor';
    sub.firstFailureAt = this.d.now();
    sub.failedRetries = 0;
    sub.failedOrderRef = orderRef;
    await this.notify(sub.userId, 'odeme_basarisiz', this.d.now(), orderRef);
  }

  private async downgrade(sub: Subscription) {
    sub.status = 'sona_erdi';
    await this.s.saveSubscription(sub);
    await this.recomputePlan(sub.userId);
    await this.ensureProviderCanceled(sub);
    await this.notify(sub.userId, 'plan_ucretsize_indi', this.d.now(), sub.id);
  }

  /**
   * Dunning tick (4.5/10): retry on calendar day 1, 3 and 7 after the failure (D1); when the third retry
   * fails the plan drops to Ucretsiz in the same tick, credits stay. Canceled subscriptions are never
   * retried (O2).
   */
  async runDunning(): Promise<void> {
    for (const sub of await this.s.listSubscriptions())
      await this.isolate('deneme_hatasi', { subscriptionId: sub.id }, () => this.dunOne(sub));
  }

  private async dunOne(sub: Subscription): Promise<void> {
    const now = this.d.now();
    if (sub.status !== 'odeme_bekliyor' || !sub.firstFailureAt || !sub.failedOrderRef) return;
    if (sub.cancelAtPeriodEnd || sub.canceledAt) return;
    const step = nextDunningStep(sub.firstFailureAt, sub.failedRetries);
    if (!dueToday(step.at, now)) return;
    if (step.action === 'downgrade') return this.downgrade(sub);
    const r = await this.d.iyzico.retrySubscriptionOrder(sub.failedOrderRef);
    if (r.status === 'success') {
      const detail = await this.d.iyzico.retrieveSubscription(sub.providerRef);
      const o = detail.orders.find((x) => x.referenceCode === sub.failedOrderRef);
      const pid = successfulPaymentId(o);
      if (pid && !(await this.s.findCharge(pid)))
        await this.renew(sub, sub.failedOrderRef, pid, o?.price ?? sub.priceKurus);
      await this.s.saveSubscription(sub);
      return;
    }
    sub.failedRetries += 1;
    await this.s.saveSubscription(sub);
    if (sub.failedRetries >= RETRY_DAYS.length) await this.downgrade(sub);
  }

  /**
   * One subscription or order never stops a daily loop (Y-N6): any error is raised as an alert with the
   * ids only, and the loop goes on. Returns false when the step failed.
   */
  private async isolate(
    kind: string,
    ids: Record<string, string>,
    fn: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch (e) {
      await this.s
        .alert(kind, { ...ids, error: e instanceof Error ? e.name : 'Error' })
        .catch(() => undefined);
      return false;
    }
  }

  /**
   * One provider refund per refund_ref (Y2, Y3, Y-N1). The row may be opened earlier as hazir; it becomes
   * bekliyor right before the call. A definite failure marks it basarisiz (retry allowed); an unknown
   * outcome leaves it bekliyor, raises iade_sonucu_bilinmiyor and is never resent: an administrator closes it
   * with resolvePendingRefund within 3 work days (karar 2026-10-22). True for the caller that completed it.
   */
  private async providerRefund(p: {
    refundRef: string;
    paymentId: string;
    amountKurus: number;
    orderId: string | null;
    subscriptionId: string | null;
    raw?: Record<string, unknown>;
  }): Promise<boolean> {
    const prev = await this.s.findRefund(p.refundRef);
    if (prev?.status === 'basarili') return false;
    if (prev?.status === 'bekliyor') throw new BillingError(409, 'refund_pending');
    if (prev) {
      if (!(await this.s.setRefundStatus(p.refundRef, ['hazir', 'basarisiz'], 'bekliyor', p.raw)))
        throw new BillingError(409, 'refund_pending');
    } else if (!(await this.openRefund({ ...p, status: 'bekliyor' })))
      throw new BillingError(409, 'refund_pending');
    try {
      await this.d.iyzico.refund({
        paymentId: p.paymentId,
        priceKurus: p.amountKurus,
        conversationId: p.refundRef,
        ip: '0.0.0.0',
      });
    } catch (e) {
      if (e instanceof IyzicoError && e.definite) {
        await this.s.setRefundStatus(p.refundRef, ['bekliyor'], 'basarisiz');
        throw new BillingError(502, 'refund_failed');
      }
      await this.s.alert('iade_sonucu_bilinmiyor', {
        refundRef: p.refundRef,
        paymentId: p.paymentId,
        amountKurus: p.amountKurus,
        resolveBy: addBusinessDays(this.d.now(), 3).toISOString(),
      });
      throw new BillingError(409, 'refund_pending');
    }
    return this.s.setRefundStatus(p.refundRef, ['bekliyor'], 'basarili');
  }

  private openRefund(p: {
    refundRef: string;
    paymentId: string;
    amountKurus: number;
    orderId: string | null;
    subscriptionId: string | null;
    raw?: Record<string, unknown>;
    status: 'hazir' | 'bekliyor';
  }): Promise<boolean> {
    return this.s.addPayment({
      orderId: p.orderId,
      subscriptionId: p.subscriptionId,
      providerPaymentId: p.paymentId,
      refundRef: p.refundRef,
      amountKurus: p.amountKurus,
      kind: 'iade',
      status: p.status,
      raw: p.raw ?? null,
      at: this.d.now(),
    });
  }

  /**
   * Make sure iyzico stops charging a canceled subscription (Y-N1, Y-N2): the state is read at iyzico and
   * the cancel call is sent only while it is still live. A failure raises iptal_bekliyor; the daily
   * reconcileCancellations retries it.
   */
  private async ensureProviderCanceled(sub: Subscription): Promise<boolean> {
    try {
      const detail = await this.d.iyzico.retrieveSubscription(sub.providerRef);
      if (detail.status === 'CANCELED' || detail.status === 'EXPIRED') return true;
      await this.d.iyzico.cancelSubscription(sub.providerRef);
      return true;
    } catch (e) {
      await this.s.alert('iptal_bekliyor', {
        subscriptionId: sub.id,
        error: e instanceof Error ? e.name : 'Error',
      });
      return false;
    }
  }

  /**
   * POST /v1/subscriptions/{id}/cancel: one step, default at period end. Order (Y-N1, Y-N2): the
   * cancellation and, for an annual immediate cancel, the refund row (hazir) are stored first; then iyzico
   * is told to stop charging; then the refund is sent. A repeated call resumes every step that is missing.
   */
  private async operation<T>(
    userId: string,
    operation: string,
    key: string,
    body: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    const claim = await this.s.claimOperation(userId, operation, key, hash(body));
    if (claim.state === 'done') return claim.result as T;
    if (claim.state !== 'claimed')
      throw new BillingError(
        409,
        claim.state === 'pending' ? 'operation_in_progress' : 'idempotency_key_reused',
      );
    try {
      const result = await run();
      await this.s.finishOperation(userId, operation, key, result);
      return result;
    } catch (error) {
      await this.s.releaseOperation(userId, operation, key);
      throw error;
    }
  }

  async cancel(
    userId: string,
    subId: string,
    mode: 'donem_sonu' | 'hemen',
    idempotencyKey?: string,
  ): Promise<{ status: string; refundAmountKurus?: number }> {
    if (idempotencyKey)
      return this.operation(userId, 'subscription.cancel', idempotencyKey, { subId, mode }, () =>
        this.cancel(userId, subId, mode),
      );
    const sub = await this.s.getSubscription(subId);
    if (!sub || sub.userId !== userId) throw new BillingError(404, 'subscription_not_found');
    if (sub.status === 'sona_erdi') throw new BillingError(409, 'already_ended');
    const now = this.d.now();
    const refundRef = `fesih:${sub.id}`;
    const fresh = sub.status !== 'iptal' && !(mode === 'donem_sonu' && sub.cancelAtPeriodEnd);
    if (fresh) {
      // Monthly list price of the table in force when the period was bought (D4).
      const product = findProduct(this.table(sub.currentPeriodStart), sub.planCode);
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
      sub.cancelAtPeriodEnd = decision.cancelAtPeriodEnd;
      sub.canceledAt = now;
      if (mode === 'hemen') {
        sub.status = 'iptal';
        sub.currentPeriodEnd = now;
      }
      await this.s.saveSubscription(sub);
      if (mode === 'hemen' && decision.refundAmountKurus > 0 && sub.lastPaymentId)
        await this.openRefund({
          refundRef,
          paymentId: sub.lastPaymentId,
          amountKurus: decision.refundAmountKurus,
          orderId: null,
          subscriptionId: sub.id,
          status: 'hazir',
        });
      await this.s.dropRenewalNotices(sub.userId, sub.id);
      await this.recomputePlan(sub.userId);
      await this.notify(
        sub.userId,
        'fesih_teyidi',
        now,
        `${sub.id}:${mode}:${decision.endsAt.toISOString()}`,
      );
    }
    // No further charges at iyzico in either mode; entitlement stays until the period end for donem_sonu.
    if (!(await this.ensureProviderCanceled(sub))) throw new BillingError(502, 'cancel_failed');
    const refund = await this.s.findRefund(refundRef);
    if (refund && (refund.status === 'hazir' || refund.status === 'basarisiz'))
      await this.finishCancelRefund(sub, refund.amountKurus);
    if (refund?.status === 'bekliyor') throw new BillingError(409, 'refund_pending');
    return {
      status: sub.status === 'iptal' ? 'iptal' : 'donem_sonunda_bitecek',
      refundAmountKurus: refund?.amountKurus ?? 0,
    };
  }

  private async finishCancelRefund(sub: Subscription, amountKurus: number) {
    if (!sub.lastPaymentId) throw new BillingError(409, 'no_payment');
    const won = await this.providerRefund({
      refundRef: `fesih:${sub.id}`,
      paymentId: sub.lastPaymentId,
      amountKurus,
      orderId: null,
      subscriptionId: sub.id,
    });
    if (won) await this.invoice(sub.userId, null, 'iade', amountKurus, 'Yıllık plan iadesi');
  }

  /**
   * Daily job (Y-N2): every canceled subscription is checked at iyzico and canceled there if it is still
   * live; immediate cancel refunds that were opened but not sent are sent.
   */
  async reconcileCancellations(): Promise<number> {
    let fixed = 0;
    // Only cancellations of the last 60 days (D-N9); iyzico is asked once per subscription and the cancel
    // is sent only when it still shows the subscription live.
    const since = this.d.now().getTime() - 60 * 86_400_000;
    for (const sub of await this.s.listSubscriptions()) {
      const at = sub.canceledAt ?? (sub.status === 'sona_erdi' ? sub.currentPeriodEnd : null);
      if (!at || at.getTime() < since) continue;
      await this.isolate('iptal_bekliyor', { subscriptionId: sub.id }, async () => {
        if (!(await this.ensureProviderCanceled(sub))) return;
        fixed++;
        const refund = await this.s.findRefund(`fesih:${sub.id}`);
        if (refund?.status === 'hazir') await this.finishCancelRefund(sub, refund.amountKurus);
      });
    }
    return fixed;
  }

  /**
   * Accounts deleted while the deletion hook failed (O9): deleted users with live subscriptions or unused package credits are
   * run through onAccountDeletion by the daily job.
   */
  async reconcileDeletedAccounts(): Promise<number> {
    let n = 0;
    for (const userId of await this.s.listDeletedUsersNeedingBillingRecovery())
      if (await this.isolate('silme_kancasi_hatasi', { userId }, () => this.onAccountDeletion(userId))) n++;
    return n;
  }

  /** Ends subscriptions whose period is over after a donem_sonu cancellation (also while a charge failed). */
  async closeEndedPeriods(): Promise<void> {
    const now = this.d.now();
    for (const sub of await this.s.listSubscriptions()) {
      if (
        sub.cancelAtPeriodEnd &&
        (sub.status === 'aktif' || sub.status === 'odeme_bekliyor') &&
        sub.currentPeriodEnd.getTime() <= now.getTime()
      ) {
        sub.status = 'sona_erdi';
        await this.s.saveSubscription(sub);
        await this.recomputePlan(sub.userId);
      }
    }
  }

  /**
   * POST /v1/refund-requests (O9). Refunded at once: a package inside the 14 day rule with no credit used
   * (4.5/4), and the first period of a subscription within 14 days with none of its credits used (karar
   * 2026-10-22). Anything else becomes a pending request for an administrator.
   */
  async requestRefund(
    userId: string,
    orderId: string,
    reason?: string,
    idempotencyKey?: string,
  ): Promise<{ id: string; status: 'tamamlandi' | 'bekliyor'; amountKurus: number | null }> {
    const order = await this.s.getOrder(orderId);
    if (!order || order.userId !== userId) throw new BillingError(404, 'order_not_found');
    if (idempotencyKey)
      return this.operation(
        userId,
        'refund.request',
        idempotencyKey,
        { orderId, reason: reason ?? null },
        () => this.requestRefund(userId, orderId, reason),
      );
    const existing = (await this.s.listRefundRequests(userId)).find((r) => r.orderId === orderId);
    if (existing?.status === 'tamamlandi')
      return { id: existing.id, status: 'tamamlandi', amountKurus: existing.amountKurus };
    const id = existing?.id ?? this.d.newId();
    if (!existing)
      await this.s.createRefundRequest({
        id,
        userId,
        orderId,
        subscriptionId: null,
        reason: reason ?? null,
        amountKurus: order.amountKurus,
        status: 'bekliyor',
      });
    const target = await this.refundTarget(order);
    if (!target) return { id, status: 'bekliyor', amountKurus: order.amountKurus };
    await this.refundHeldLot(order, target);
    await this.s.updateRefundRequest(id, 'tamamlandi', order.amountKurus);
    return { id, status: 'tamamlandi', amountKurus: order.amountKurus };
  }

  /** The untouched lot an order may be refunded against, or null when the rules do not allow it. */
  private async refundTarget(
    order: Order,
  ): Promise<{ originRef: string; refundRef: string; subscription: Subscription | null } | null> {
    if (order.status !== 'odendi' || !order.paymentId || !order.paidAt) return null;
    const product = findProduct(this.table(order.createdAt), order.productCode);
    let originRef = `order:${order.id}`;
    let refundRef = `paket:${order.id}`;
    let subscription: Subscription | null = null;
    if (product?.kind === 'abonelik') {
      const charge = await this.s.findCharge(order.paymentId);
      subscription = charge?.subscriptionId ? await this.s.getSubscription(charge.subscriptionId) : null;
      if (!subscription || subscription.grantsDelivered !== 1 || subscription.status === 'sona_erdi')
        return null;
      if (subscription.lastPaymentId !== order.paymentId) return null;
      originRef = `abonelik:${subscription.id}:${subscription.currentPeriodStart.toISOString()}:ilk`;
      refundRef = `abonelik:${subscription.id}`;
    } else if (!product?.credits) return null;
    const walletId = await this.s.walletOf(order.userId);
    const now = this.d.now();
    const ok = await this.d.ledger.run(walletId, (l) => {
      const lot = l.wallet(walletId).lots.find((x) => x.originRef === originRef);
      return (
        !!lot &&
        !lot.closedBy &&
        packageRefundAllowed({
          purchasedAt: order.paidAt as Date,
          now,
          originalCredits: lot.originalCredits,
          remainingCredits: lot.remainingCredits,
        })
      );
    });
    return ok ? { originRef, refundRef, subscription } : null;
  }

  /** 14 day unused package refund (4.5/4) with the hold, provider, reversal order of Y3. */
  async refundPackage(userId: string, orderId: string): Promise<{ refunded: boolean; amountKurus: number }> {
    const order = await this.s.getOrder(orderId);
    if (!order || order.userId !== userId) throw new BillingError(404, 'order_not_found');
    if (order.status === 'iade_edildi') return { refunded: true, amountKurus: order.amountKurus };
    const target = await this.refundTarget(order);
    if (!target) throw new BillingError(409, 'not_refundable');
    await this.refundHeldLot(order, target);
    return { refunded: true, amountKurus: order.amountKurus };
  }

  /**
   * Hold the lot for the whole refund (30 days, D-N5), refund at iyzico, then reverse the held credits.
   * Definite failure: the credits come back. Unknown outcome: they stay locked until an administrator
   * resolves the refund (O-N1). A subscription refund also cancels the subscription first.
   */
  private async refundHeldLot(
    order: Order,
    t: { originRef: string; refundRef: string; subscription: Subscription | null },
  ): Promise<void> {
    const walletId = await this.s.walletOf(order.userId);
    const op = `iade:${t.refundRef}:${this.d.newId()}`;
    await this.d.ledger.run(walletId, (l) =>
      l.holdLot({ operationId: op, walletId, originRef: t.originRef, now: this.d.now() }),
    );
    if (t.subscription) {
      const sub = t.subscription;
      sub.status = 'iptal';
      sub.canceledAt = this.d.now();
      sub.currentPeriodEnd = this.d.now();
      sub.cancelAtPeriodEnd = false;
      await this.s.saveSubscription(sub);
      await this.s.dropRenewalNotices(sub.userId, sub.id);
      await this.recomputePlan(sub.userId);
      await this.notify(
        sub.userId,
        'fesih_teyidi',
        this.d.now(),
        `${sub.id}:hemen:${this.d.now().toISOString()}`,
      );
      if (!(await this.ensureProviderCanceled(sub))) {
        await this.d.ledger.run(walletId, (l) =>
          l.settle({ walletId, operationId: op, outcome: 'teknik_hata', now: this.d.now() }),
        );
        throw new BillingError(502, 'cancel_failed');
      }
    }
    let won: boolean;
    try {
      won = await this.providerRefund({
        refundRef: t.refundRef,
        paymentId: order.paymentId as string,
        amountKurus: order.amountKurus,
        orderId: order.id,
        subscriptionId: t.subscription?.id ?? null,
        raw: { holdOp: op, walletId },
      });
    } catch (e) {
      const pending = e instanceof BillingError && e.code === 'refund_pending';
      await this.d.ledger.run(walletId, (l) =>
        pending
          ? // Unknown outcome: the hold no longer expires; only the administrator decision ends it (D-N6).
            l.extendReservation(walletId, op, new Date(this.d.now().getTime() + 10 * 365 * 86_400_000))
          : l.settle({ walletId, operationId: op, outcome: 'teknik_hata', now: this.d.now() }),
      );
      throw e;
    }
    await this.finishHeldRefund(order, walletId, op, won);
  }

  private async finishHeldRefund(order: Order, walletId: string, op: string, invoice: boolean) {
    await this.d.ledger.run(walletId, (l) => {
      const r = l.wallet(walletId).reservations.find((x) => x.operationId === op);
      if (r?.status === 'acik' || r?.status === 'tuketildi')
        return l.refundHeld({ walletId, operationId: op, now: this.d.now() });
      // A hold released before the decision (data from before D-N6): reverse the lot if it is untouched.
      return l.refundUnusedLot({
        key: `iade_karari:${op}`,
        walletId,
        originRef: `order:${order.id}`,
        now: this.d.now(),
      });
    });
    order.status = 'iade_edildi';
    await this.s.saveOrder(order);
    if (invoice) await this.invoice(order.userId, order.id, 'iade', order.amountKurus, 'İade');
  }

  /** Refunds whose outcome is unknown, for the administrator (karar 2026-10-22: 3 work days). */
  async listPendingRefunds(): Promise<
    {
      refundRef: string;
      paymentId: string;
      amountKurus: number;
      orderId: string | null;
      since: Date;
      resolveBy: Date;
    }[]
  > {
    return (await this.s.listRefunds('bekliyor')).map((p) => ({
      refundRef: p.refundRef as string,
      paymentId: p.providerPaymentId,
      amountKurus: p.amountKurus,
      orderId: p.orderId,
      since: p.at,
      resolveBy: addBusinessDays(p.at, 3),
    }));
  }

  /**
   * Administrator decision on an unknown refund outcome, after checking the iyzico panel (O-N1). basarili:
   * the held credits are reversed and the refund is invoiced; basarisiz: the credits come back and the
   * refund can be requested again. Wired to kimlik's admin skeleton (istek odeme-denetim-2).
   */
  async resolvePendingRefund(
    refundRef: string,
    outcome: 'basarili' | 'basarisiz',
    actorId?: string,
  ): Promise<void> {
    const row = await this.s.findRefund(refundRef);
    if (!row || row.status !== 'bekliyor') throw new BillingError(409, 'not_pending');
    if (!(await this.s.setRefundStatus(refundRef, ['bekliyor'], outcome)))
      throw new BillingError(409, 'not_pending');
    const holdOp = typeof row.raw?.holdOp === 'string' ? row.raw.holdOp : null;
    const walletId = typeof row.raw?.walletId === 'string' ? row.raw.walletId : null;
    const order = row.orderId ? await this.s.getOrder(row.orderId) : null;
    if (outcome === 'basarili') {
      if (order && holdOp && walletId) await this.finishHeldRefund(order, walletId, holdOp, true);
      else {
        const userId =
          order?.userId ??
          (row.subscriptionId ? (await this.s.getSubscription(row.subscriptionId))?.userId : null);
        if (userId) await this.invoice(userId, row.orderId, 'iade', row.amountKurus, 'İade');
      }
      if (order) {
        const req = (await this.s.listRefundRequests(order.userId)).find((r) => r.orderId === order.id);
        if (req) await this.s.updateRefundRequest(req.id, 'tamamlandi', row.amountKurus);
      }
    } else if (holdOp && walletId)
      await this.d.ledger.run(walletId, (l) =>
        l.settle({ walletId, operationId: holdOp, outcome: 'teknik_hata', now: this.d.now() }),
      );
    await this.s.alert('iade_cozuldu', { refundRef, outcome, actorId: actorId ?? null });
  }

  /**
   * Chargeback reported by iyzico: claw back the order's credits (4.5/11). One clawback per order; a lot
   * that was already refunded is not clawed back again (O3).
   */
  async adminChargeback(actorId: string, key: string, input: { orderId: string; caseRef: string }) {
    return this.operation(actorId, 'admin.chargeback', key, input, async () => ({
      balance: await this.chargeback(input.orderId, input.caseRef),
    }));
  }
  async adminPriceChange(actorId: string, key: string, input: { planCode: string; newPriceKurus: number }) {
    return this.operation(actorId, 'admin.price_change', key, input, async () => ({
      notified: await this.announcePriceChange(input.planCode, input.newPriceKurus),
    }));
  }
  async chargeback(orderId: string, caseRef: string): Promise<number> {
    const order = await this.s.getOrder(orderId);
    if (!order) throw new BillingError(404, 'order_not_found');
    const walletId = await this.s.walletOf(order.userId);
    const balance = await this.d.ledger.run(walletId, (l) => {
      l.clawback({
        key: `ters_ibraz:order:${order.id}`,
        walletId,
        originRef: `order:${order.id}`,
        reason: 'ters_ibraz',
        now: this.d.now(),
      });
      return l.balance(walletId);
    });
    await this.s.alert('ters_ibraz', { orderId, caseRef, balance });
    return balance;
  }

  /** Signup gift (D8): 50 promotional credits for 90 days, once per user. */
  async grantSignupPromo(userId: string): Promise<number> {
    const walletId = await this.s.walletOf(userId);
    const key = `kayit:${userId}`;
    await this.d.ledger.run(walletId, (l) =>
      l.findByKey(key) || l.wallet(walletId).lots.some((x) => x.originRef === key)
        ? null
        : l.grant({
            key,
            walletId,
            source: 'promosyon',
            credits: SIGNUP_PROMO_CREDITS,
            originRef: key,
            now: this.d.now(),
          }),
    );
    return SIGNUP_PROMO_CREDITS;
  }

  /**
   * Account deletion (O9, plan 4.5/12): every subscription is stored as canceled first, then canceled at
   * iyzico; a failed iyzico call does not stop the others and is retried by reconcileCancellations (Y-N2).
   * Unused purchased credits become a pending refund request for an administrator. Billing records stay.
   */
  async onAccountDeletion(
    userId: string,
    options?: { requestRefund?: boolean },
  ): Promise<{ canceled: number; providerPending: number; refundRequested: boolean }> {
    let canceled = 0;
    let providerPending = 0;
    for (const sub of await this.s.listSubscriptions(userId)) {
      if (sub.status === 'iptal' || sub.status === 'sona_erdi') continue;
      sub.status = 'iptal';
      sub.canceledAt = this.d.now();
      sub.currentPeriodEnd = this.d.now();
      await this.s.saveSubscription(sub);
      await this.s.dropRenewalNotices(userId, sub.id);
      if (!(await this.ensureProviderCanceled(sub))) providerPending++;
      canceled++;
    }
    await this.recomputePlan(userId);
    const walletId = await this.s.walletOf(userId);
    const unused = await this.d.ledger.run(walletId, (l) =>
      l
        .wallet(walletId)
        .lots.filter((x) => x.source === 'paket' && !x.closedBy)
        .reduce((s, x) => s + x.remainingCredits, 0),
    );
    const requestRefund = options?.requestRefund ?? (await this.s.deletionRefundPreference(userId));
    const alreadyRequested = (await this.s.listRefundRequests(userId)).some((r) =>
      r.reason?.startsWith('hesap_silme:'),
    );
    if (requestRefund && unused > 0 && !alreadyRequested)
      await this.s.createRefundRequest({
        id: createHash('sha256')
          .update(`account-deletion-refund:${userId}`)
          .digest('hex')
          .slice(0, 32)
          .replace(/^(........)(....).(...).(...)(............)$/, '$1-$2-5$3-8$4-$5'),
        userId,
        orderId: null,
        subscriptionId: null,
        reason: `hesap_silme:${unused}_kredi`,
        amountKurus: null,
        status: 'bekliyor',
      });
    return { canceled, providerPending, refundRequested: requestRefund && unused > 0 };
  }

  /** billing.monthly_grant: annual plans receive their monthly credits while active (9.2/3). */
  async monthlyGrant(): Promise<number> {
    const now = this.d.now();
    let n = 0;
    for (const sub of await this.s.listSubscriptions())
      await this.isolate('yukleme_hatasi', { subscriptionId: sub.id }, async () => {
        const product = findProduct(this.table(), sub.planCode);
        if (product?.interval !== 'yillik' || sub.status !== 'aktif') return;
        const due = Math.min(
          annualGrantsDue(sub.currentPeriodStart, now),
          annualGrantsDue(sub.currentPeriodStart, sub.currentPeriodEnd),
        );
        while (sub.grantsDelivered < due) {
          await this.grantMonth(sub, `ay${sub.grantsDelivered + 1}`);
          await this.s.saveSubscription(sub);
          n++;
        }
      });
    return n;
  }

  /**
   * billing.reconcile: iyzico's daily report against recorded charges; differences raise an alert. Refund
   * lines are not compared (the report does not document their link to the payment). When the report call
   * is not available the job reports disabled and raises mutabakat_devre_disi instead of failing (O8).
   */
  async reconcileDay(date: Date): Promise<ReconcileResult> {
    // One calendar day in Europe/Istanbul, the zone of iyzico's report (D-N2).
    const dayStr = istanbulDay(date);
    let report;
    try {
      report = await this.d.iyzico.listTransactions(dayStr);
    } catch (e) {
      await this.s.alert('mutabakat_devre_disi', {
        day: dayStr,
        error: e instanceof Error ? e.name : 'Error',
      });
      return { disabled: true, diffs: [] };
    }
    const payments = (await this.s.paymentsOn(dayStr)).filter((p) => p.kind === 'odeme');
    const known = new Set(payments.map((p) => p.providerPaymentId));
    const byOrder = new Map(
      payments.filter((p) => p.orderId).map((p) => [p.orderId as string, p.providerPaymentId]),
    );
    // transactionId is expected to equal paymentId; when it does not, the conversationId (our order id)
    // links the line, and the mapping is reported so it can be confirmed in the sandbox (DEVIR).
    let remapped = 0;
    const provider = report
      .filter((t) => t.kind === 'odeme')
      .map((t) => {
        const linked =
          !known.has(t.paymentId) && t.conversationId ? byOrder.get(t.conversationId) : undefined;
        if (linked) remapped++;
        return { paymentId: linked ?? t.paymentId, kind: t.kind, amountKurus: t.amountKurus };
      });
    const recorded = payments.map((p) => ({
      paymentId: p.providerPaymentId,
      kind: p.kind,
      amountKurus: p.amountKurus,
    }));
    const diffs = reconcile(provider, recorded);
    if (remapped) await this.s.alert('mutabakat_eslesme', { day: dayStr, remapped });
    if (diffs.length) await this.s.alert('mutabakat_farki', { day: dayStr, diffs });
    return { disabled: false, diffs };
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
      await this.notify(
        sub.userId,
        'fiyat_degisikligi',
        now,
        `${sub.id}:${newPriceKurus}:${effectiveAt.toISOString()}`,
      );
      n++;
    }
    return n;
  }

  /** Redeem a credit coupon as a 90 day promotional lot, once per coupon and user, inside its limit (D10). */
  async redeemCoupon(userId: string, code: string): Promise<number> {
    const normalized = normalizeCouponCode(code);
    const c = await this.s.getCoupon(normalized);
    const check = checkCoupon(c, this.d.now());
    if (!check.ok && check.reason === 'tukendi') throw new BillingError(409, 'coupon_exhausted');
    if (!check.ok || check.kind !== 'kredi' || !c) throw new BillingError(400, 'invalid_coupon');
    if (await this.s.hasRedeemed(c.code, userId)) return check.credits;
    if (!(await this.s.claimCouponSlot(c.code))) throw new BillingError(409, 'coupon_exhausted');
    const walletId = await this.s.walletOf(userId);
    const key = `kupon:${c.code}:${userId}`;
    try {
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
      if (!(await this.s.recordRedemption(c.code, userId, { ledgerTransactionId: tx.id })))
        await this.s.releaseCouponSlot(c.code);
    } catch (e) {
      await this.s.releaseCouponSlot(c.code);
      throw e;
    }
    return check.credits;
  }

  /* Wallet views (contracts Wallet, LedgerMovement, Invoice) */

  async wallet(userId: string) {
    const walletId = await this.s.walletOf(userId);
    return this.d.ledger.run(walletId, (l) => {
      const now = this.d.now();
      l.sweepExpired(walletId, now);
      l.expirePromos(walletId, now);
      return {
        balance: l.balance(walletId, now),
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
      : t.kind === 'iade' && t.entries.every((e) => e.accountCode !== ACCOUNTS.wallet(walletId))
        ? -t.entries.filter((e) => e.accountCode === ACCOUNTS.refund).reduce((s, e) => s + e.credits, 0)
        : t.entries
            .filter((e) => e.accountCode === ACCOUNTS.wallet(walletId))
            .reduce((s, e) => s + (e.side === 'alacak' ? e.credits : -e.credits), 0);
  return [{ id: t.id, at: t.at.toISOString(), credits, kind, description: null }];
}

export { LedgerError };
