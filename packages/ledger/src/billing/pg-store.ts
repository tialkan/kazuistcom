/**
 * Postgres billing store over the packages/db tables (migrations 0001 and 0003). Plain SQL through a
 * query client (pg.Pool in production, PGlite in tests). Each method is one statement or an idempotent
 * sequence; uniqueness lives in the database (orders_idem_uq, orders_checkout_token_uq,
 * payments_charge_uq, payments_refund_uq, webhook_events_provider_event_uq, notices_uq,
 * coupon_redemptions_uq).
 */
import type { Ledger, PriceTable } from '../index.ts';
import { listWalletTransactions, walletRunner, type PoolLike, type SqlClient } from '../pg.ts';
import type {
  BillingStore,
  Consent,
  CouponRow,
  Invoice,
  LedgerPort,
  Notice,
  Order,
  Payment,
  PaymentStatus,
  Plan,
  RefundRequest,
  Subscription,
  WebhookEvent,
} from './store.ts';
import { planRole } from './store.ts';

const PROVIDER = 'iyzico';
const PLAN_ROLES = ['plus', 'akademisyen'] as const;
export { planRole };

type Row = Record<string, unknown>;
const d = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));
const dn = (v: unknown): Date | null => (v === null || v === undefined ? null : d(v));

export class PgBillingStore implements BillingStore {
  constructor(
    private readonly db: SqlClient,
    /** Keyed subject hash for consents.user_hash (kimlik's subjectHash). */
    private readonly hashSubject: (userId: string) => string,
  ) {}

  private async one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
    const { rows } = await this.db.query<T>(sql, params);
    return (rows[0] as T | undefined) ?? null;
  }

  /** Seed price_tables and products from a price table version (idempotent). */
  async ensureCatalog(t: PriceTable): Promise<void> {
    await this.db.query(
      `insert into price_tables (version, effective_from, operations) values ($1, $2, $3::jsonb)
       on conflict (version) do nothing`,
      [t.version, t.effectiveFrom, JSON.stringify(t.operations)],
    );
    const pt = await this.one<{ id: string }>('select id from price_tables where version = $1', [t.version]);
    for (const p of t.products)
      await this.db.query(
        `insert into products (code, kind, price_table_id, price_kurus, credits, monthly_credits)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (code) do update set price_table_id = excluded.price_table_id, price_kurus = excluded.price_kurus,
           credits = excluded.credits, monthly_credits = excluded.monthly_credits`,
        [p.code, p.kind, pt?.id, p.priceKurus, p.credits, p.monthlyCredits],
      );
  }

  async walletOf(userId: string): Promise<string> {
    await this.db.query('insert into wallets (user_id) values ($1) on conflict (user_id) do nothing', [
      userId,
    ]);
    return (await this.one<{ id: string }>('select id from wallets where user_id = $1', [userId]))
      ?.id as string;
  }

  private orderOf(r: Row): Order {
    return {
      id: String(r.id),
      userId: String(r.user_id),
      productCode: String(r.product_code),
      couponCode: (r.coupon_code as string | null) ?? null,
      amountKurus: Number(r.amount_kurus),
      status: r.status as Order['status'],
      idempotencyKey: String(r.idempotency_key),
      consentVersions: r.consent_versions as Order['consentVersions'],
      checkoutToken: (r.checkout_token as string | null) ?? null,
      paymentId: (r.provider_payment_id as string | null) ?? null,
      createdAt: d(r.created_at),
      paidAt: dn(r.paid_at),
    };
  }
  private readonly orderSql = `select o.*, p.code product_code, c.code coupon_code from orders o
    join products p on p.id = o.product_id left join coupons c on c.id = o.coupon_id`;

  async saveOrder(o: Order): Promise<void> {
    await this.db.query(
      `insert into orders (id, user_id, product_id, coupon_id, amount_kurus, status, idempotency_key, consent_versions,
         checkout_token, provider_payment_id, paid_at, created_at)
       values ($1, $2, (select id from products where code = $3), (select id from coupons where code = $4), $5, $6, $7,
         $8::jsonb, $9, $10, $11, $12)
       on conflict (id) do update set status = excluded.status, checkout_token = excluded.checkout_token,
         provider_payment_id = excluded.provider_payment_id, paid_at = excluded.paid_at, updated_at = now()`,
      [
        o.id,
        o.userId,
        o.productCode,
        o.couponCode,
        o.amountKurus,
        o.status,
        o.idempotencyKey,
        JSON.stringify(o.consentVersions),
        o.checkoutToken,
        o.paymentId,
        o.paidAt,
        o.createdAt,
      ],
    );
  }
  async getOrder(id: string) {
    const r = await this.one(`${this.orderSql} where o.id = $1`, [id]);
    return r ? this.orderOf(r) : null;
  }
  async findOrderByKey(userId: string, key: string) {
    const r = await this.one(`${this.orderSql} where o.user_id = $1 and o.idempotency_key = $2`, [
      userId,
      key,
    ]);
    return r ? this.orderOf(r) : null;
  }
  async findOrderByPaymentId(pid: string) {
    const r = await this.one(`${this.orderSql} where o.provider_payment_id = $1`, [pid]);
    return r ? this.orderOf(r) : null;
  }
  async listDeletedUsersWithLiveSubscriptions() {
    const { rows } = await this.db.query<{ user_id: string }>(
      `select distinct s.user_id from subscriptions s join users u on u.id = s.user_id
        where u.deleted_at is not null and s.status in ('aktif', 'odeme_bekliyor')`,
    );
    return rows.map((r) => r.user_id);
  }
  async findOrderByToken(token: string) {
    const r = await this.one(`${this.orderSql} where o.checkout_token = $1`, [token]);
    return r ? this.orderOf(r) : null;
  }

  async addPayment(p: Payment): Promise<boolean> {
    const { rows } = await this.db.query(
      `insert into payments (order_id, subscription_id, provider, provider_payment_id, amount_kurus, status, kind, refund_ref, created_at, raw)
       values ($1, $2, $3, $4, $5, $9, $6, $7, $8, $10::jsonb) on conflict do nothing returning id`,
      [
        p.orderId,
        p.subscriptionId,
        PROVIDER,
        p.providerPaymentId,
        p.amountKurus,
        p.kind,
        p.refundRef,
        p.at,
        p.status ?? 'basarili',
        p.raw ? JSON.stringify(p.raw) : null,
      ],
    );
    return rows.length > 0;
  }
  private paymentOf(r: Row): Payment {
    return {
      orderId: (r.order_id as string | null) ?? null,
      subscriptionId: (r.subscription_id as string | null) ?? null,
      providerPaymentId: String(r.provider_payment_id),
      refundRef: (r.refund_ref as string | null) ?? null,
      amountKurus: Number(r.amount_kurus),
      kind: r.kind as Payment['kind'],
      status: r.status as PaymentStatus,
      raw: (r.raw as Record<string, unknown> | null) ?? null,
      at: d(r.created_at),
    };
  }
  async findCharge(id: string) {
    const r = await this.one(
      `select * from payments where provider = $1 and provider_payment_id = $2 and kind = 'odeme'`,
      [PROVIDER, id],
    );
    return r ? this.paymentOf(r) : null;
  }
  async findRefund(ref: string) {
    const r = await this.one(
      `select * from payments where provider = $1 and refund_ref = $2 and kind = 'iade'`,
      [PROVIDER, ref],
    );
    return r ? this.paymentOf(r) : null;
  }
  async setRefundStatus(
    ref: string,
    from: PaymentStatus[],
    to: PaymentStatus,
    raw?: Record<string, unknown>,
  ) {
    const { rows } = await this.db.query(
      `update payments set status = $3, raw = coalesce(raw, '{}'::jsonb) || coalesce($5::jsonb, '{}'::jsonb)
        where provider = $1 and refund_ref = $2 and kind = 'iade' and status = any($4::text[]) returning id`,
      [PROVIDER, ref, to, from, raw ? JSON.stringify(raw) : null],
    );
    return rows.length > 0;
  }
  async listRefunds(status: PaymentStatus) {
    const { rows } = await this.db.query<Row>(
      `select * from payments where provider = $1 and kind = 'iade' and status = $2 order by created_at`,
      [PROVIDER, status],
    );
    return rows.map((r) => this.paymentOf(r));
  }
  async listPendingOrders(since: Date) {
    const { rows } = await this.db.query<Row>(
      `${this.orderSql} where o.checkout_token is not null
         and (o.status = 'inceleniyor' or (o.status = 'bekliyor' and o.created_at >= $1))
        order by o.created_at`,
      [since],
    );
    return rows.map((r) => this.orderOf(r));
  }
  async paymentsOn(day: string) {
    const { rows } = await this.db.query<Row>(
      `select * from payments where provider = $1 and status = 'basarili' and (created_at at time zone 'Europe/Istanbul')::date = $2::date`,
      [PROVIDER, day],
    );
    return rows.map((r) => this.paymentOf(r));
  }

  private subOf(r: Row): Subscription {
    return {
      id: String(r.id),
      userId: String(r.user_id),
      planCode: String(r.product_code),
      providerRef: String(r.provider_ref),
      status: r.status as Subscription['status'],
      priceKurus: Number(r.price_kurus ?? 0),
      currentPeriodStart: d(r.current_period_start),
      currentPeriodEnd: d(r.current_period_end),
      cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
      canceledAt: dn(r.canceled_at),
      grantsDelivered: Number(r.grants_delivered),
      lastPaymentId: (r.last_payment_id as string | null) ?? null,
      firstFailureAt: dn(r.first_failure_at),
      failedRetries: Number(r.failed_retries),
      failedOrderRef: (r.failed_order_ref as string | null) ?? null,
      pendingPrice:
        r.pending_price_kurus === null || r.pending_price_kurus === undefined
          ? null
          : { priceKurus: Number(r.pending_price_kurus), effectiveAt: d(r.pending_price_effective_at) },
    };
  }
  private readonly subSql = `select s.*, p.code product_code from subscriptions s join products p on p.id = s.product_id`;

  async saveSubscription(s: Subscription): Promise<void> {
    await this.db.query(
      `insert into subscriptions (id, user_id, product_id, channel, provider_ref, status, current_period_start,
         current_period_end, cancel_at_period_end, canceled_at, grants_delivered, price_kurus, last_payment_id,
         first_failure_at, failed_retries, failed_order_ref, pending_price_kurus, pending_price_effective_at)
       values ($1, $2, (select id from products where code = $3), 'iyzico', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17)
       on conflict (id) do update set status = excluded.status, current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
         canceled_at = excluded.canceled_at, grants_delivered = excluded.grants_delivered,
         price_kurus = excluded.price_kurus, last_payment_id = excluded.last_payment_id,
         first_failure_at = excluded.first_failure_at, failed_retries = excluded.failed_retries,
         failed_order_ref = excluded.failed_order_ref, pending_price_kurus = excluded.pending_price_kurus,
         pending_price_effective_at = excluded.pending_price_effective_at, updated_at = now()`,
      [
        s.id,
        s.userId,
        s.planCode,
        s.providerRef,
        s.status,
        s.currentPeriodStart,
        s.currentPeriodEnd,
        s.cancelAtPeriodEnd,
        s.canceledAt,
        s.grantsDelivered,
        s.priceKurus,
        s.lastPaymentId,
        s.firstFailureAt,
        s.failedRetries,
        s.failedOrderRef,
        s.pendingPrice?.priceKurus ?? null,
        s.pendingPrice?.effectiveAt ?? null,
      ],
    );
  }
  async getSubscription(id: string) {
    const r = await this.one(`${this.subSql} where s.id = $1`, [id]);
    return r ? this.subOf(r) : null;
  }
  async findSubscriptionByRef(ref: string) {
    const r = await this.one(`${this.subSql} where s.channel = 'iyzico' and s.provider_ref = $1`, [ref]);
    return r ? this.subOf(r) : null;
  }
  async listSubscriptions(userId?: string) {
    const { rows } = await this.db.query<Row>(
      `${this.subSql} where s.channel = 'iyzico' and ($1::uuid is null or s.user_id = $1) order by s.created_at`,
      [userId ?? null],
    );
    return rows.map((r) => this.subOf(r));
  }

  async addConsents(cs: Consent[]): Promise<void> {
    for (const c of cs)
      await this.db.query(
        `insert into consents (user_id, user_hash, kind, version, granted, context, created_at)
         values ($1, $2, $3::consent_kind, $4, $5, $6::jsonb, $7)`,
        [c.userId, this.hashSubject(c.userId), c.kind, c.version, c.granted, JSON.stringify(c.context), c.at],
      );
  }

  async addNotice(n: Notice) {
    await this.db.query(
      'insert into notices (user_id, kind, ref, send_at) values ($1, $2, $3, $4) on conflict do nothing',
      [n.userId, n.kind, n.ref, n.sendAt],
    );
  }
  async dropRenewalNotices(userId: string, subId: string) {
    await this.db.query(
      `delete from notices where user_id = $1 and sent_at is null and kind in ('odeme_7_gun', 'yillik_30_gun')
         and ref like $2`,
      [userId, `${subId}:%`],
    );
  }
  async listNotices(userId: string) {
    const { rows } = await this.db.query<Row>('select * from notices where user_id = $1 order by send_at', [
      userId,
    ]);
    return rows.map((r) => ({ userId, kind: String(r.kind), ref: String(r.ref), sendAt: d(r.send_at) }));
  }

  async addInvoice(i: Invoice) {
    const { rows } = await this.db.query(
      `insert into invoices (id, order_id, user_id, number, kind, total_kurus, provider_ref, issued_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (number) do nothing returning id`,
      [i.id, i.orderId, i.userId, i.number, i.kind, i.totalKurus, i.providerRef, i.issuedAt],
    );
    return rows.length > 0;
  }
  async listInvoices(userId: string) {
    const { rows } = await this.db.query<Row>(
      'select * from invoices where user_id = $1 order by issued_at desc',
      [userId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      userId,
      orderId: (r.order_id as string | null) ?? null,
      number: String(r.number),
      kind: r.kind as Invoice['kind'],
      totalKurus: Number(r.total_kurus),
      providerRef: (r.provider_ref as string | null) ?? null,
      issuedAt: d(r.issued_at),
    }));
  }

  async getWebhook(eventId: string): Promise<WebhookEvent | null> {
    const r = await this.one('select * from webhook_events where provider = $1 and event_id = $2', [
      PROVIDER,
      eventId,
    ]);
    if (!r) return null;
    return {
      provider: 'iyzico',
      eventId,
      eventType: String(r.event_type),
      signatureValid: Boolean(r.signature_valid),
      payload: r.payload,
      processedAt: dn(r.processed_at),
      error: (r.error as string | null) ?? null,
    };
  }
  async saveWebhook(e: WebhookEvent) {
    await this.db.query(
      `insert into webhook_events (provider, event_id, event_type, signature_valid, payload, processed_at, error)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7)
       on conflict (provider, event_id) do update set processed_at = excluded.processed_at, error = excluded.error`,
      [PROVIDER, e.eventId, e.eventType, e.signatureValid, JSON.stringify(e.payload), e.processedAt, e.error],
    );
  }

  async getCoupon(code: string): Promise<CouponRow | null> {
    const r = await this.one('select * from coupons where code = $1', [code]);
    if (!r) return null;
    return {
      code: String(r.code),
      credits: (r.credits as number | null) ?? null,
      percentOff: (r.percent_off as number | null) ?? null,
      maxRedemptions: (r.max_redemptions as number | null) ?? null,
      redeemed: Number(r.redeemed),
      validUntil: dn(r.valid_until),
    };
  }
  async hasRedeemed(code: string, userId: string) {
    const r = await this.one(
      `select 1 from coupon_redemptions r join coupons c on c.id = r.coupon_id where c.code = $1 and r.user_id = $2`,
      [code, userId],
    );
    return r !== null;
  }
  async claimCouponSlot(code: string) {
    const { rows } = await this.db.query(
      `update coupons set redeemed = redeemed + 1
        where code = $1 and (max_redemptions is null or redeemed < max_redemptions) returning id`,
      [code],
    );
    return rows.length > 0;
  }
  async deleteRedemption(code: string, userId: string) {
    await this.db.query(
      'delete from coupon_redemptions r using coupons c where c.id = r.coupon_id and c.code = $1 and r.user_id = $2',
      [code, userId],
    );
  }
  async releaseCouponSlot(code: string) {
    await this.db.query('update coupons set redeemed = greatest(redeemed - 1, 0) where code = $1', [code]);
  }
  async recordRedemption(
    code: string,
    userId: string,
    target: { ledgerTransactionId?: string; orderId?: string },
  ) {
    const { rows } = await this.db.query(
      `insert into coupon_redemptions (coupon_id, user_id, ledger_transaction_id, order_id)
       select id, $2, $3, $4 from coupons where code = $1 on conflict do nothing returning id`,
      [code, userId, target.ledgerTransactionId ?? null, target.orderId ?? null],
    );
    return rows.length > 0;
  }
  async createRefundRequest(r: RefundRequest) {
    await this.db.query(
      `insert into refund_requests (id, user_id, order_id, subscription_id, reason, amount_kurus, status)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do nothing`,
      [r.id, r.userId, r.orderId, r.subscriptionId, r.reason, r.amountKurus, r.status],
    );
  }
  async updateRefundRequest(id: string, status: RefundRequest['status'], amountKurus?: number | null) {
    await this.db.query(
      `update refund_requests set status = $2, amount_kurus = coalesce($3, amount_kurus),
         decided_at = case when $2 in ('onaylandi', 'reddedildi', 'tamamlandi') then now() else decided_at end
       where id = $1`,
      [id, status, amountKurus ?? null],
    );
  }
  async listRefundRequests(userId: string) {
    const { rows } = await this.db.query<Row>(
      'select * from refund_requests where user_id = $1 order by created_at',
      [userId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      userId,
      orderId: (r.order_id as string | null) ?? null,
      subscriptionId: (r.subscription_id as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      amountKurus: (r.amount_kurus as number | null) ?? null,
      status: r.status as RefundRequest['status'],
    }));
  }

  async setPlan(userId: string, plan: Plan) {
    const role = planRole(plan);
    await this.db.query('delete from user_roles where user_id = $1 and role_id = any($2::text[])', [
      userId,
      [...PLAN_ROLES],
    ]);
    if (role !== 'ucretsiz')
      await this.db.query(
        'insert into user_roles (user_id, role_id) values ($1, $2) on conflict do nothing',
        [userId, role],
      );
  }
  async getPlan(userId: string): Promise<Plan> {
    const { rows } = await this.db.query<{ role_id: string }>(
      'select role_id from user_roles where user_id = $1 and role_id = any($2::text[])',
      [userId, [...PLAN_ROLES]],
    );
    const ids = rows.map((r) => r.role_id);
    return ids.includes('akademisyen') ? 'akademisyen' : ids.includes('plus') ? 'plus' : 'ucretsiz';
  }

  async alert(kind: string, detail: unknown) {
    await this.db.query(
      `insert into audit_log (action, subject_type, reason, diff) values ($1, 'billing', $2, $3::jsonb)`,
      [`billing.${kind}`, kind, JSON.stringify(detail)],
    );
  }

  async planRefs() {
    const { rows } = await this.db.query<{ code: string; iyzico_plan_ref: string }>(
      'select code, iyzico_plan_ref from products where iyzico_plan_ref is not null',
    );
    return new Map(rows.map((r) => [r.code, r.iyzico_plan_ref]));
  }
  async savePlanRef(code: string, ref: string) {
    await this.db.query('update products set iyzico_plan_ref = $2 where code = $1', [code, ref]);
  }
}

/** Ledger port over Postgres: pool clients per wallet transaction, movements by wallet_id. */
export class PgLedgerPort implements LedgerPort {
  private readonly runner;
  constructor(
    private readonly db: SqlClient,
    pool?: PoolLike,
  ) {
    this.runner = walletRunner(pool ? { pool } : { client: db });
  }
  run<T>(walletId: string, fn: (l: Ledger) => T): Promise<T> {
    return this.runner.run(walletId, fn);
  }
  movements(walletId: string) {
    return listWalletTransactions(this.db, walletId);
  }
}
