/**
 * Billing persistence port. MemoryBillingStore backs the tests; the Postgres store over the
 * packages/db billing tables follows in the next step (DEVIR). LedgerPort wraps the credit ledger:
 * MemoryLedgerPort for tests; the database port wraps withWallet of @kazuist/ledger/pg.
 */
import { Ledger, type LedgerTx } from '@kazuist/ledger';

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
export interface Consent {
  userId: string;
  kind: 'on_bilgilendirme' | 'mesafeli_sozlesme' | 'cayma_istisnasi';
  version: string;
  granted: boolean;
  context: Record<string, unknown>;
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

export class MemoryBillingStore {
  orders = new Map<string, Order>();
  payments: Payment[] = [];
  subscriptions = new Map<string, Subscription>();
  consents: Consent[] = [];
  notices: Notice[] = [];
  invoices: Invoice[] = [];
  webhooks = new Map<string, WebhookEvent>();
  coupons = new Map<string, CouponRow>();
  wallets = new Map<string, string>();
  /** userId -> plan entitlement ('ucretsiz' when no active subscription). */
  plans = new Map<string, string>();
  alerts: { kind: string; detail: unknown }[] = [];

  walletOf(userId: string): string {
    let w = this.wallets.get(userId);
    if (!w) {
      w = `wallet-${userId}`;
      this.wallets.set(userId, w);
    }
    return w;
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
