/**
 * Postgres billing store over the packages/db tables (migrations 0001 and 0003). Plain SQL through a
 * query client (pg.Pool in production, PGlite in tests). Each method is one statement or an idempotent
 * sequence; uniqueness lives in the database (orders_idem_uq, orders_checkout_token_uq,
 * payments_charge_uq, payments_refund_uq, webhook_events_provider_event_uq, notices_uq,
 * coupon_redemptions_uq).
 */
import type { Ledger, PriceTable } from '../index.ts';
import { listWalletTransactions, walletRunner, withWallet, type PoolLike, type SqlClient } from '../pg.ts';
import type {
  BillingStore,
  DeletionRefundItem,
  DeletionRefundDecision,
  DeletionRefundResolution,
  OperationClaim,
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

// PGlite has one connection. Production uses a dedicated pool connection per active operation.
const localOperationLocks = new WeakMap<SqlClient, Set<string>>();
const activePoolLocks = new WeakMap<SqlClient, number>();
const PROVIDER = 'iyzico';
const PLAN_ROLES = ['plus', 'akademisyen'] as const;
export { planRole };

type Row = Record<string, unknown>;
const d = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));
const dn = (v: unknown): Date | null => (v === null || v === undefined ? null : d(v));

export class PgBillingStore implements BillingStore {
  private refundRequestOf(r: Row): RefundRequest {
    return {
      id: String(r.id),
      userId: String(r.user_id),
      orderId: r.order_id as string | null,
      subscriptionId: r.subscription_id as string | null,
      reason: r.reason as string | null,
      amountKurus: r.amount_kurus as number | null,
      status: r.status as RefundRequest['status'],
      createdAt: d(r.created_at),
      decidedAt: dn(r.decided_at),
      decidedBy: r.decided_by as string | null,
      decisionReason: r.decision_reason as string | null,
      decisionKey: r.decision_key as string | null,
      decisionHash: r.decision_hash as string | null,
    };
  }
  async getDeletionRefundRequest(id: string) {
    const r = await this.one(
      `select r.* from refund_requests r join users u on u.id=r.user_id where r.id=$1 and u.deleted_at is not null and r.order_id is null and r.subscription_id is null and r.reason like 'hesap_silme:%'`,
      [id],
    );
    return r ? this.refundRequestOf(r) : null;
  }
  async listDeletionRefundRequests(status: RefundRequest['status'], offset: number) {
    const { rows } = await this.db.query<Row>(
      `select r.* from refund_requests r join users u on u.id=r.user_id where r.status=$1 and u.deleted_at is not null and r.order_id is null and r.subscription_id is null and r.reason like 'hesap_silme:%' order by r.created_at,r.id limit 51 offset $2`,
      [status, offset],
    );
    return rows.map((r) => this.refundRequestOf(r));
  }
  async listUserOrders(userId: string) {
    const { rows } = await this.db.query<Row>(`${this.orderSql} where o.user_id=$1 order by o.id`, [userId]);
    return rows.map((r) => this.orderOf(r));
  }
  async refundExposure(orderId: string) {
    const row = await this.one<{ amount: number }>(
      `select ((select coalesce(sum(amount_kurus),0) from payments where order_id=$1 and provider=$2 and kind='iade' and status in ('hazir','bekliyor','basarili'))+
      (select coalesce(sum(i.approved_amount_kurus),0) from refund_request_items i where i.order_id=$1 and not exists(select 1 from payments p where p.provider=$2 and p.kind='iade' and p.refund_ref=i.provider_refund_ref and p.status in ('hazir','bekliyor','basarili'))))::int as amount`,
      [orderId, PROVIDER],
    );
    return row?.amount ?? 0;
  }
  async listDeletionRefundItems(requestId: string): Promise<DeletionRefundItem[]> {
    const { rows } = await this.db.query<Row>(
      'select * from refund_request_items where request_id=$1 order by order_id,id',
      [requestId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      requestId,
      orderId: String(r.order_id),
      originalPaidKurus: Number(r.original_paid_kurus),
      originalCredits: Number(r.original_credits),
      unusedCredits: Number(r.unused_credits),
      approvedAmountKurus: Number(r.approved_amount_kurus),
      holdOperationId: String(r.hold_operation_id),
      providerRefundRef: String(r.provider_refund_ref),
      state: r.state as PaymentStatus,
      providerResultRef: r.provider_result_ref as string | null,
      resolvedBy: r.resolved_by as string | null,
      resolvedAt: dn(r.resolved_at),
      resolutionReason: r.resolution_reason as string | null,
      updatedBy: String(r.updated_by),
      stateReason: String(r.state_reason),
    }));
  }
  async insertDeletionRefundItems(items: DeletionRefundItem[]) {
    for (const i of items)
      await this.db.query(
        `insert into refund_request_items(id,request_id,order_id,original_paid_kurus,original_credits,unused_credits,approved_amount_kurus,hold_operation_id,provider_refund_ref,state,updated_by,state_reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'hazir',$10,$11)`,
        [
          i.id,
          i.requestId,
          i.orderId,
          i.originalPaidKurus,
          i.originalCredits,
          i.unusedCredits,
          i.approvedAmountKurus,
          i.holdOperationId,
          i.providerRefundRef,
          i.updatedBy,
          i.stateReason,
        ],
      );
  }
  async decideDeletionRefundRequest(id: string, d: DeletionRefundDecision) {
    const { rows } = await this.db.query(
      `update refund_requests set status=$2,amount_kurus=$3,decided_by=$4,decided_at=$5,decision_reason=$6,decision_key=$7,decision_hash=$8 where id=$1 and status='bekliyor' and decision_reason is null returning id`,
      [id, d.status, d.amountKurus, d.actorId, d.at, d.reason, d.key, d.hash],
    );
    return rows.length > 0;
  }
  async completeDeletionRefundRequest(id: string, amountKurus: number) {
    await this.db.query(
      "update refund_requests set status='tamamlandi',amount_kurus=$2 where id=$1 and status='onaylandi'",
      [id, amountKurus],
    );
  }
  async setDeletionRefundItemState(
    id: string,
    from: PaymentStatus[],
    to: PaymentStatus,
    actor: string,
    reason: string,
    resolution?: DeletionRefundResolution,
  ) {
    const { rows } = await this.db.query(
      `update refund_request_items set state=$3,updated_by=$4,state_reason=$5,updated_at=now(),
      resolved_by=case when $6::uuid is not null then $6 when state='basarisiz' and $3='bekliyor' then null else resolved_by end,
      resolved_at=case when $6::uuid is not null then $7::timestamptz when state='basarisiz' and $3='bekliyor' then null else resolved_at end,
      resolution_reason=case when $6::uuid is not null then $8 when state='basarisiz' and $3='bekliyor' then null else resolution_reason end,
      provider_result_ref=case when $6::uuid is not null then $9 when state='basarisiz' and $3='bekliyor' then null else provider_result_ref end
      where id=$1 and state=any($2::text[]) returning id`,
      [
        id,
        from,
        to,
        actor,
        reason,
        resolution?.actorId ?? null,
        resolution?.at ?? null,
        resolution?.reason ?? null,
        resolution?.providerResultRef ?? null,
      ],
    );
    return rows.length > 0;
  }
  async withRefundRequestTransaction<T>(
    requestId: string,
    _ledger: LedgerPort,
    fn: (store: BillingStore, ledger: LedgerPort) => Promise<T>,
  ): Promise<T> {
    const write = async (tx: SqlClient) => {
      const { rows } = await tx.query('select id from refund_requests where id=$1 for update', [requestId]);
      if (!rows.length) throw new Error('refund_request_not_found');
      const store = new PgBillingStore(tx, this.hashSubject);
      const ledger: LedgerPort = {
        run: (walletId, run) => withWallet(tx, walletId, run, { withinTransaction: true }),
        movements: (walletId) => listWalletTransactions(tx, walletId),
      };
      return fn(store, ledger);
    };
    if ('transaction' in this.db && typeof this.db.transaction === 'function')
      return (
        this.db as SqlClient & { transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> }
      ).transaction(write);
    const client =
      'connect' in this.db && typeof this.db.connect === 'function'
        ? await (this.db as SqlClient & PoolLike).connect()
        : null;
    const tx = client ?? this.db;
    try {
      await tx.query('begin');
      const result = await write(tx);
      await tx.query('commit');
      return result;
    } catch (error) {
      await tx.query('rollback');
      throw error;
    } finally {
      client?.release();
    }
  }
  private operationLocks = new Map<string, () => Promise<void>>();
  private async lockOperation(id: string): Promise<(() => Promise<void>) | null> {
    if ('connect' in this.db && typeof this.db.connect === 'function') {
      // Keep a pool connection available for the business operation and ledger transaction.
      const max = (this.db as SqlClient & { options?: { max?: number } }).options?.max ?? 10;
      const active = activePoolLocks.get(this.db) ?? 0;
      if (active >= Math.max(0, max - 1)) return null;
      activePoolLocks.set(this.db, active + 1);
      let client;
      try {
        client = await (this.db as SqlClient & PoolLike).connect();
      } catch (error) {
        activePoolLocks.set(this.db, (activePoolLocks.get(this.db) ?? 1) - 1);
        throw error;
      }
      const release = (destroy = false) => {
        (client as SqlClient & { release(destroy?: boolean): void }).release(destroy);
        activePoolLocks.set(this.db, (activePoolLocks.get(this.db) ?? 1) - 1);
      };
      try {
        const { rows } = await client.query<{ locked: boolean }>(
          'select pg_try_advisory_lock(hashtextextended($1,0)) as locked',
          [id],
        );
        if (!rows[0]?.locked) {
          release();
          return null;
        }
        return async () => {
          try {
            await client.query('select pg_advisory_unlock(hashtextextended($1,0))', [id]);
          } catch (error) {
            release(true);
            throw error;
          }
          release();
        };
      } catch (error) {
        release();
        throw error;
      }
    }
    let locks = localOperationLocks.get(this.db);
    if (!locks) {
      locks = new Set();
      localOperationLocks.set(this.db, locks);
    }
    if (locks.has(id)) return null;
    locks.add(id);
    return async () => {
      locks.delete(id);
    };
  }
  async claimOperation(
    userId: string,
    operation: string,
    key: string,
    requestHash: string,
  ): Promise<OperationClaim> {
    const id = JSON.stringify([userId, operation, key]);
    const unlock = await this.lockOperation(id);
    if (!unlock) {
      const row = await this.one<{ request_hash: string }>(
        'select request_hash from idempotency_keys where user_id=$1 and operation=$2 and key=$3',
        [userId, operation, key],
      );
      return row && row.request_hash !== requestHash ? { state: 'conflict' } : { state: 'pending' };
    }
    let keepLock = false;
    try {
      await this.db.query(
        `insert into idempotency_keys (user_id,operation,key,request_hash,expires_at)
        values ($1,$2,$3,$4,now()+interval '7 days') on conflict (user_id,operation,key) do nothing`,
        [userId, operation, key, requestHash],
      );
      const row = await this.one<{
        request_hash: string;
        response_status: number | null;
        response_body: unknown;
      }>(
        'select request_hash,response_status,response_body from idempotency_keys where user_id=$1 and operation=$2 and key=$3',
        [userId, operation, key],
      );
      if (!row || row.request_hash !== requestHash) return { state: 'conflict' };
      if (row.response_status !== null) return { state: 'done', result: row.response_body };
      // The lock belonged to a dead process if a pending row already existed. Resume the business
      // operation; its refund/provider state machine independently prevents a second money movement.
      this.operationLocks.set(id, unlock);
      keepLock = true;
      return { state: 'claimed' };
    } finally {
      if (!keepLock) await unlock();
    }
  }
  private async unlockOperation(userId: string, operation: string, key: string) {
    const id = JSON.stringify([userId, operation, key]);
    const unlock = this.operationLocks.get(id);
    this.operationLocks.delete(id);
    if (unlock) await unlock();
  }
  async finishOperation(userId: string, operation: string, key: string, result: unknown) {
    try {
      await this.db.query(
        'update idempotency_keys set response_status=200,response_body=$4::jsonb where user_id=$1 and operation=$2 and key=$3',
        [userId, operation, key, JSON.stringify(result)],
      );
    } finally {
      await this.unlockOperation(userId, operation, key);
    }
  }
  async releaseOperation(userId: string, operation: string, key: string) {
    // Keep the request hash even after a failure; the next owner can safely resume the same body.
    await this.unlockOperation(userId, operation, key);
  }

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
    const pt = await this.one<{ id: string; matches: boolean }>(
      'select id,(effective_from=$2 and operations=$3::jsonb) as matches from price_tables where version=$1',
      [t.version, t.effectiveFrom, JSON.stringify(t.operations)],
    );
    if (!pt?.matches) throw new Error('price_version_content_mismatch');
    for (const p of t.products) {
      await this.db.query(
        `insert into products (code, kind, price_table_id, price_kurus, credits, monthly_credits)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (code, price_table_id) do nothing`,
        [p.code, p.kind, pt?.id, p.priceKurus, p.credits, p.monthlyCredits],
      );
      const product = await this.one<{ matches: boolean }>(
        `select (kind=$3 and price_kurus=$4 and credits is not distinct from $5::integer
        and monthly_credits is not distinct from $6::integer) as matches from products where code=$1 and price_table_id=$2`,
        [p.code, pt.id, p.kind, p.priceKurus, p.credits, p.monthlyCredits],
      );
      if (!product?.matches) throw new Error('price_version_content_mismatch');
    }
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
      productId: String(r.product_id),
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
       values ($1, $2, coalesce((select product_id from orders where id=$1), $13::uuid, (select p.id from products p join price_tables t on t.id=p.price_table_id where p.code=$3 and t.effective_from <= $12 order by t.effective_from desc,t.version desc limit 1)), (select id from coupons where code = $4), $5, $6, $7,
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
        o.productId ?? null,
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
  async listDeletedUsersNeedingBillingRecovery() {
    const { rows } = await this.db.query<{ user_id: string }>(
      `select u.id as user_id from users u where u.deleted_at is not null and (
         exists (select 1 from subscriptions s where s.user_id = u.id and s.status in ('aktif', 'odeme_bekliyor'))
         or (exists (select 1 from wallets w join credit_lots l on l.wallet_id = w.id
                      where w.user_id = u.id and l.source = 'paket' and l.remaining_credits > 0)
             and not exists (select 1 from refund_requests r where r.user_id = u.id and r.reason like 'hesap_silme:%'))
       )`,
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
      productId: String(r.product_id),
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
       values ($1, $2, coalesce((select product_id from subscriptions where id=$1), $18::uuid, (select p.id from products p join price_tables t on t.id=p.price_table_id where p.code=$3 and t.effective_from <= $6 order by t.effective_from desc,t.version desc limit 1)), 'iyzico', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
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
        s.productId ?? null,
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

  async planRefs(version?: string) {
    const { rows } = await this.db.query<{ code: string; iyzico_plan_ref: string }>(
      `select p.code,p.iyzico_plan_ref from products p join price_tables t on t.id=p.price_table_id
      where p.iyzico_plan_ref is not null and t.version=coalesce($1,(select version from price_tables where effective_from<=now() order by effective_from desc,version desc limit 1))`,
      [version ?? null],
    );
    return new Map(rows.map((r) => [r.code, r.iyzico_plan_ref]));
  }
  async savePlanRef(code: string, ref: string, version?: string) {
    await this.db.query(
      `update products set iyzico_plan_ref=$2 where code=$1 and price_table_id=(select id from price_tables
      where ($3::text is not null and version=$3) or ($3::text is null and effective_from<=now()) order by effective_from desc,version desc limit 1)`,
      [code, ref, version ?? null],
    );
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
