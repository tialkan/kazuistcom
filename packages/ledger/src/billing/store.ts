/**
 * Billing persistence port. MemoryBillingStore backs fast unit tests; PgBillingStore (pg-store.ts) is the
 * production store over the packages/db billing tables (migration 0003). LedgerPort wraps the ledger.
 */
import { Ledger, istanbulDay, type LedgerTx } from '../index.ts';

/** inceleniyor: paid, iyzico fraud review open (fraudStatus 0); never closed by the 2 day rule (Y-N5). */
export type OrderStatus = 'bekliyor' | 'inceleniyor' | 'odendi' | 'basarisiz' | 'iade_edildi';
export interface Order {
  id: string;
  userId: string;
  productCode: string;
  productId?: string;
  couponCode: string | null;
  amountKurus: number;
  status: OrderStatus;
  idempotencyKey: string;
  consentVersions: Record<string, string | boolean>;
  checkoutToken: string | null;
  paymentId: string | null;
  createdAt: Date;
  paidAt: Date | null;
}
export interface Payment {
  orderId: string | null;
  subscriptionId: string | null;
  providerPaymentId: string;
  /** Required for refunds; (provider, refund_ref) is unique. */
  refundRef: string | null;
  amountKurus: number;
  kind: 'odeme' | 'iade';
  /** Refunds are written as bekliyor before the provider call (Y2, Y3); charges are basarili. */
  status?: PaymentStatus;
  /** Refund bookkeeping, for example the ledger hold of a package refund ({ holdOp }). */
  raw?: Record<string, unknown> | null;
  at: Date;
}
/** hazir: refund row opened, provider not called yet; bekliyor: call sent, outcome not known yet. */
export type PaymentStatus = 'hazir' | 'bekliyor' | 'basarili' | 'basarisiz';
export interface RefundRequest {
  id: string;
  userId: string;
  orderId: string | null;
  subscriptionId: string | null;
  reason: string | null;
  amountKurus: number | null;
  status: 'bekliyor' | 'onaylandi' | 'reddedildi' | 'tamamlandi';
}
export type SubStatus = 'aktif' | 'odeme_bekliyor' | 'iptal' | 'sona_erdi';
export interface Subscription {
  id: string;
  userId: string;
  planCode: string;
  productId?: string;
  providerRef: string;
  status: SubStatus;
  priceKurus: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  grantsDelivered: number;
  lastPaymentId: string | null;
  firstFailureAt: Date | null;
  failedRetries: number;
  failedOrderRef: string | null;
  pendingPrice: { priceKurus: number; effectiveAt: Date } | null;
}
export type BillingConsentKind =
  'on_bilgilendirme' | 'mesafeli_sozlesme' | 'cayma_istisnasi' | 'abonelik_sozlesmesi' | 'yillik_taahhutname';
export interface Consent {
  userId: string;
  kind: BillingConsentKind;
  version: string;
  granted: boolean;
  /** contracts ConsentContext */
  context: { orderId?: string; subscriptionId?: string; productCode?: string; channel?: 'web' | 'ios' };
  at: Date;
}
export interface Notice {
  userId: string;
  kind: string;
  sendAt: Date;
  ref: string;
}
export interface Invoice {
  id: string;
  userId: string;
  orderId: string | null;
  number: string;
  kind: 'satis' | 'iade';
  totalKurus: number;
  providerRef: string | null;
  issuedAt: Date;
}
export interface WebhookEvent {
  provider: 'iyzico';
  eventId: string;
  eventType: string;
  signatureValid: boolean;
  payload: unknown;
  processedAt: Date | null;
  error: string | null;
}
export interface CouponRow {
  code: string;
  credits: number | null;
  percentOff: number | null;
  maxRedemptions: number | null;
  redeemed: number;
  validUntil: Date | null;
}
export type Plan = 'ucretsiz' | string;

/** Plan entitlement role of a plan code (plan 4.2): ogrenci.* is plus, akademisyen.* is akademisyen. */
export function planRole(code: Plan): 'ucretsiz' | 'plus' | 'akademisyen' {
  if (code.startsWith('akademisyen')) return 'akademisyen';
  if (code.startsWith('ogrenci') || code === 'plus') return 'plus';
  return 'ucretsiz';
}

export type OperationClaim =
  { state: 'claimed' } | { state: 'conflict' } | { state: 'pending' } | { state: 'done'; result: unknown };
export interface PreparedLegalDocument {
  slug: 'on-bilgilendirme' | 'mesafeli-satis' | 'abonelik';
  version: string;
  text: string;
  sha256: string;
  sourceSha256?: string | null;
  fields: Readonly<Record<string, string>>;
}
export interface BillingStore {
  saveCheckout(order: Order, consents: Consent[], documents: readonly PreparedLegalDocument[]): Promise<void>;
  deletionRefundPreference(userId: string): Promise<boolean>;
  claimOperation(
    userId: string,
    operation: string,
    key: string,
    requestHash: string,
  ): Promise<OperationClaim>;
  finishOperation(userId: string, operation: string, key: string, result: unknown): Promise<void>;
  releaseOperation(userId: string, operation: string, key: string): Promise<void>;
  walletOf(userId: string): Promise<string>;
  saveOrder(o: Order): Promise<void>;
  getOrder(id: string): Promise<Order | null>;
  findOrderByKey(userId: string, key: string): Promise<Order | null>;
  findOrderByToken(token: string): Promise<Order | null>;
  findOrderByPaymentId(paymentId: string): Promise<Order | null>;
  /** Deleted accounts that still have a live subscription (O9 retry). */
  listDeletedUsersNeedingBillingRecovery(): Promise<string[]>;
  /** Returns false when the payment row already exists (idempotent). */
  addPayment(p: Payment): Promise<boolean>;
  findCharge(providerPaymentId: string): Promise<Payment | null>;
  findRefund(refundRef: string): Promise<Payment | null>;
  /** Conditional status change of a refund row; true only for the caller that changed it. */
  setRefundStatus(
    refundRef: string,
    from: PaymentStatus[],
    to: PaymentStatus,
    raw?: Record<string, unknown>,
  ): Promise<boolean>;
  listRefunds(status: PaymentStatus): Promise<Payment[]>;
  /** Orders still waiting for a payment result, created at or after `since` (recheck job, Y-N3, Y-N4). */
  listPendingOrders(since: Date): Promise<Order[]>;
  paymentsOn(day: string): Promise<Payment[]>;
  saveSubscription(s: Subscription): Promise<void>;
  getSubscription(id: string): Promise<Subscription | null>;
  findSubscriptionByRef(ref: string): Promise<Subscription | null>;
  listSubscriptions(userId?: string): Promise<Subscription[]>;
  addConsents(c: Consent[]): Promise<void>;
  addNotice(n: Notice): Promise<void>;
  dropRenewalNotices(userId: string, subscriptionId: string): Promise<void>;
  listNotices(userId: string): Promise<Notice[]>;
  /** False when the invoice number already exists. */
  addInvoice(i: Invoice): Promise<boolean>;
  listInvoices(userId: string): Promise<Invoice[]>;
  getWebhook(eventId: string): Promise<WebhookEvent | null>;
  saveWebhook(e: WebhookEvent): Promise<void>;
  getCoupon(code: string): Promise<CouponRow | null>;
  hasRedeemed(code: string, userId: string): Promise<boolean>;
  /** Take one use of the coupon if its limit allows (D10); releaseCouponSlot gives it back. */
  claimCouponSlot(code: string): Promise<boolean>;
  releaseCouponSlot(code: string): Promise<void>;
  /** Undo the redemption of a failed order (O-N2). */
  deleteRedemption(code: string, userId: string): Promise<void>;
  /** One redemption per coupon and user; returns false if already redeemed. */
  recordRedemption(
    code: string,
    userId: string,
    target: { ledgerTransactionId?: string; orderId?: string },
  ): Promise<boolean>;
  createRefundRequest(r: RefundRequest): Promise<void>;
  updateRefundRequest(
    id: string,
    status: RefundRequest['status'],
    amountKurus?: number | null,
  ): Promise<void>;
  listRefundRequests(userId: string): Promise<RefundRequest[]>;
  setPlan(userId: string, plan: Plan): Promise<void>;
  getPlan(userId: string): Promise<Plan>;
  alert(kind: string, detail: unknown): Promise<void>;
  planRefs(version?: string): Promise<Map<string, string>>;
  savePlanRef(planCode: string, ref: string, version?: string): Promise<void>;
}

export class MemoryBillingStore implements BillingStore {
  private operations = new Map<string, { hash: string; result?: unknown; active: boolean }>();
  async claimOperation(
    userId: string,
    operation: string,
    key: string,
    requestHash: string,
  ): Promise<OperationClaim> {
    const id = JSON.stringify([userId, operation, key]);
    const row = this.operations.get(id);
    if (row)
      return row.hash !== requestHash
        ? { state: 'conflict' }
        : row.result === undefined
          ? row.active
            ? { state: 'pending' }
            : ((row.active = true), { state: 'claimed' })
          : { state: 'done', result: structuredClone(row.result) };
    this.operations.set(id, { hash: requestHash, active: true });
    return { state: 'claimed' };
  }
  async finishOperation(userId: string, operation: string, key: string, result: unknown) {
    const row = this.operations.get(JSON.stringify([userId, operation, key]));
    if (row) {
      row.result = structuredClone(result);
      row.active = false;
    }
  }
  async releaseOperation(userId: string, operation: string, key: string) {
    const row = this.operations.get(JSON.stringify([userId, operation, key]));
    if (row) row.active = false;
  }

  frozenDocuments = new Map<string, readonly PreparedLegalDocument[]>();
  deletionRefundPreferences = new Map<string, boolean>();
  async deletionRefundPreference(userId: string) {
    return this.deletionRefundPreferences.get(userId) ?? true;
  }
  async saveCheckout(order: Order, consents: Consent[], documents: readonly PreparedLegalDocument[]) {
    await this.saveOrder(order);
    await this.addConsents(consents);
    this.frozenDocuments.set(order.id, structuredClone(documents));
  }
  orders = new Map<string, Order>();
  payments: Payment[] = [];
  subscriptions = new Map<string, Subscription>();
  consents: Consent[] = [];
  notices: Notice[] = [];
  invoices: Invoice[] = [];
  webhooks = new Map<string, WebhookEvent>();
  coupons = new Map<string, CouponRow>();
  redemptions = new Set<string>();
  refundRequests: RefundRequest[] = [];
  deletedUsers = new Set<string>();
  wallets = new Map<string, string>();
  plans = new Map<string, Plan>();
  refs = new Map<string, string>();
  alerts: { kind: string; detail: unknown }[] = [];

  async walletOf(userId: string) {
    let w = this.wallets.get(userId);
    if (!w) {
      w = `wallet-${userId}`;
      this.wallets.set(userId, w);
    }
    return w;
  }
  async saveOrder(o: Order) {
    this.orders.set(o.id, o);
  }
  async getOrder(id: string) {
    return this.orders.get(id) ?? null;
  }
  async findOrderByKey(userId: string, key: string) {
    return [...this.orders.values()].find((o) => o.userId === userId && o.idempotencyKey === key) ?? null;
  }
  async findOrderByToken(token: string) {
    return [...this.orders.values()].find((o) => o.checkoutToken === token) ?? null;
  }
  async addPayment(p: Payment) {
    const dup = this.payments.some((x) =>
      p.kind === 'odeme'
        ? x.kind === 'odeme' && x.providerPaymentId === p.providerPaymentId
        : x.kind === 'iade' && x.refundRef === p.refundRef,
    );
    if (dup) return false;
    this.payments.push(p);
    return true;
  }
  async findRefund(ref: string) {
    return this.payments.find((p) => p.kind === 'iade' && p.refundRef === ref) ?? null;
  }
  async setRefundStatus(
    ref: string,
    from: PaymentStatus[],
    to: PaymentStatus,
    raw?: Record<string, unknown>,
  ) {
    const p = this.payments.find((x) => x.kind === 'iade' && x.refundRef === ref);
    if (!p || !from.includes(p.status ?? 'basarili')) return false;
    p.status = to;
    if (raw) p.raw = { ...(p.raw ?? {}), ...raw };
    return true;
  }
  async listRefunds(status: PaymentStatus) {
    return this.payments.filter((p) => p.kind === 'iade' && p.status === status);
  }
  async listPendingOrders(since: Date) {
    return [...this.orders.values()].filter(
      (o) =>
        o.checkoutToken &&
        (o.status === 'inceleniyor' || (o.status === 'bekliyor' && o.createdAt.getTime() >= since.getTime())),
    );
  }
  async findOrderByPaymentId(pid: string) {
    return [...this.orders.values()].find((o) => o.paymentId === pid) ?? null;
  }
  async listDeletedUsersNeedingBillingRecovery() {
    const live = [...this.subscriptions.values()].filter(
      (s) => this.deletedUsers.has(s.userId) && (s.status === 'aktif' || s.status === 'odeme_bekliyor'),
    );
    const packages = [...this.orders.values()].filter(
      (o) =>
        this.deletedUsers.has(o.userId) &&
        o.status === 'odendi' &&
        o.productCode.startsWith('kredi.') &&
        this.deletionRefundPreferences.get(o.userId) !== false &&
        !this.refundRequests.some((r) => r.userId === o.userId && r.reason?.startsWith('hesap_silme:')),
    );
    return [...new Set([...live.map((s) => s.userId), ...packages.map((o) => o.userId)])];
  }
  async findCharge(id: string) {
    return this.payments.find((p) => p.kind === 'odeme' && p.providerPaymentId === id) ?? null;
  }
  async paymentsOn(day: string) {
    return this.payments.filter((p) => istanbulDay(p.at) === day && (p.status ?? 'basarili') === 'basarili');
  }
  async saveSubscription(s: Subscription) {
    this.subscriptions.set(s.id, s);
  }
  async getSubscription(id: string) {
    return this.subscriptions.get(id) ?? null;
  }
  async findSubscriptionByRef(ref: string) {
    return [...this.subscriptions.values()].find((s) => s.providerRef === ref) ?? null;
  }
  async listSubscriptions(userId?: string) {
    return [...this.subscriptions.values()].filter((s) => !userId || s.userId === userId);
  }
  async addConsents(c: Consent[]) {
    this.consents.push(...c);
  }
  async addNotice(n: Notice) {
    if (!this.notices.some((x) => x.userId === n.userId && x.kind === n.kind && x.ref === n.ref))
      this.notices.push(n);
  }
  async dropRenewalNotices(userId: string, subId: string) {
    this.notices = this.notices.filter(
      (n) =>
        !(
          n.userId === userId &&
          n.ref.startsWith(`${subId}:`) &&
          (n.kind === 'odeme_7_gun' || n.kind === 'yillik_30_gun')
        ),
    );
  }
  async listNotices(userId: string) {
    return this.notices.filter((n) => n.userId === userId);
  }
  async addInvoice(i: Invoice) {
    if (this.invoices.some((x) => x.number === i.number)) return false;
    this.invoices.push(i);
    return true;
  }
  async listInvoices(userId: string) {
    return this.invoices.filter((i) => i.userId === userId);
  }
  async getWebhook(id: string) {
    return this.webhooks.get(id) ?? null;
  }
  async saveWebhook(e: WebhookEvent) {
    this.webhooks.set(e.eventId, e);
  }
  async getCoupon(code: string) {
    return this.coupons.get(code) ?? null;
  }
  async hasRedeemed(code: string, userId: string) {
    return this.redemptions.has(`${code}:${userId}`);
  }
  async claimCouponSlot(code: string) {
    const c = this.coupons.get(code);
    if (!c || (c.maxRedemptions !== null && c.redeemed >= c.maxRedemptions)) return false;
    c.redeemed += 1;
    return true;
  }
  async deleteRedemption(code: string, userId: string) {
    this.redemptions.delete(`${code}:${userId}`);
  }
  async releaseCouponSlot(code: string) {
    const c = this.coupons.get(code);
    if (c && c.redeemed > 0) c.redeemed -= 1;
  }
  async recordRedemption(code: string, userId: string) {
    const k = `${code}:${userId}`;
    if (this.redemptions.has(k)) return false;
    this.redemptions.add(k);
    return true;
  }
  async createRefundRequest(r: RefundRequest) {
    if (!this.refundRequests.some((x) => x.id === r.id)) this.refundRequests.push({ ...r });
  }
  async updateRefundRequest(id: string, status: RefundRequest['status'], amountKurus?: number | null) {
    const r = this.refundRequests.find((x) => x.id === id);
    if (r) {
      r.status = status;
      if (amountKurus !== undefined) r.amountKurus = amountKurus;
    }
  }
  async listRefundRequests(userId: string) {
    return this.refundRequests.filter((r) => r.userId === userId);
  }
  async setPlan(userId: string, plan: Plan) {
    this.plans.set(userId, planRole(plan));
  }
  async getPlan(userId: string) {
    return this.plans.get(userId) ?? 'ucretsiz';
  }
  async alert(kind: string, detail: unknown) {
    this.alerts.push({ kind, detail });
  }
  async planRefs(version?: string) {
    const prefix = version ? `${version}:` : '';
    return new Map(
      [...this.refs]
        .filter(([code]) => !version || code.startsWith(prefix))
        .map(([code, ref]) => [version ? code.slice(prefix.length) : code, ref]),
    );
  }
  async savePlanRef(code: string, ref: string, version?: string) {
    this.refs.set(version ? `${version}:${code}` : code, ref);
  }
}

export interface LedgerPort {
  run<T>(walletId: string, fn: (l: Ledger) => T): Promise<T>;
  movements(walletId: string): Promise<LedgerTx[]>;
}

export class MemoryLedgerPort implements LedgerPort {
  readonly ledger = new Ledger();
  async run<T>(_walletId: string, fn: (l: Ledger) => T): Promise<T> {
    return fn(this.ledger);
  }
  async movements(walletId: string): Promise<LedgerTx[]> {
    return this.ledger.txs.filter((t) => t.walletId === walletId);
  }
}
