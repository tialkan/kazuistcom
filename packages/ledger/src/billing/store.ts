/**
 * Billing persistence port. MemoryBillingStore backs fast unit tests; PgBillingStore (pg-store.ts) is the
 * production store over the packages/db billing tables (migration 0003). LedgerPort wraps the ledger.
 */
import { Ledger, type LedgerTx } from '../index.ts';

export type OrderStatus = 'bekliyor' | 'odendi' | 'basarisiz' | 'iade_edildi';
export interface Order {
  id: string;
  userId: string;
  productCode: string;
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
  at: Date;
}
export type SubStatus = 'aktif' | 'odeme_bekliyor' | 'iptal' | 'sona_erdi';
export interface Subscription {
  id: string;
  userId: string;
  planCode: string;
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

export interface BillingStore {
  walletOf(userId: string): Promise<string>;
  saveOrder(o: Order): Promise<void>;
  getOrder(id: string): Promise<Order | null>;
  findOrderByKey(userId: string, key: string): Promise<Order | null>;
  findOrderByToken(token: string): Promise<Order | null>;
  /** Returns false when the payment row already exists (idempotent). */
  addPayment(p: Payment): Promise<boolean>;
  findCharge(providerPaymentId: string): Promise<Payment | null>;
  paymentsOn(day: string): Promise<Payment[]>;
  saveSubscription(s: Subscription): Promise<void>;
  getSubscription(id: string): Promise<Subscription | null>;
  findSubscriptionByRef(ref: string): Promise<Subscription | null>;
  listSubscriptions(): Promise<Subscription[]>;
  addConsents(c: Consent[]): Promise<void>;
  addNotice(n: Notice): Promise<void>;
  dropRenewalNotices(userId: string, subscriptionId: string): Promise<void>;
  listNotices(userId: string): Promise<Notice[]>;
  addInvoice(i: Invoice): Promise<void>;
  listInvoices(userId: string): Promise<Invoice[]>;
  getWebhook(eventId: string): Promise<WebhookEvent | null>;
  saveWebhook(e: WebhookEvent): Promise<void>;
  getCoupon(code: string): Promise<CouponRow | null>;
  /** One redemption per coupon and user; returns false if already redeemed. */
  redeemCoupon(
    code: string,
    userId: string,
    target: { ledgerTransactionId?: string; orderId?: string },
  ): Promise<boolean>;
  setPlan(userId: string, plan: Plan): Promise<void>;
  getPlan(userId: string): Promise<Plan>;
  alert(kind: string, detail: unknown): Promise<void>;
  planRefs(): Promise<Map<string, string>>;
  savePlanRef(planCode: string, ref: string): Promise<void>;
}

export class MemoryBillingStore implements BillingStore {
  orders = new Map<string, Order>();
  payments: Payment[] = [];
  subscriptions = new Map<string, Subscription>();
  consents: Consent[] = [];
  notices: Notice[] = [];
  invoices: Invoice[] = [];
  webhooks = new Map<string, WebhookEvent>();
  coupons = new Map<string, CouponRow>();
  redemptions = new Set<string>();
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
  async findCharge(id: string) {
    return this.payments.find((p) => p.kind === 'odeme' && p.providerPaymentId === id) ?? null;
  }
  async paymentsOn(day: string) {
    return this.payments.filter((p) => p.at.toISOString().slice(0, 10) === day);
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
  async listSubscriptions() {
    return [...this.subscriptions.values()];
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
    this.invoices.push(i);
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
  async redeemCoupon(code: string, userId: string) {
    const k = `${code}:${userId}`;
    if (this.redemptions.has(k)) return false;
    this.redemptions.add(k);
    const c = this.coupons.get(code);
    if (c) c.redeemed += 1;
    return true;
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
  async planRefs() {
    return new Map(this.refs);
  }
  async savePlanRef(code: string, ref: string) {
    this.refs.set(code, ref);
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
