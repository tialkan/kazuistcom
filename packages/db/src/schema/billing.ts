import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { noticeKinds, paymentStatuses } from '@kazuist/contracts';
import { users } from './auth.ts';
import { createdAt, id, ts, updatedAt } from './_common.ts';

/** SQL literal list of contract values for CHECK constraints ('a', 'b'); values are fixed identifiers. */
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * Double entry credit ledger (plan 9.1). ledger_entries is append only (UPDATE and DELETE are blocked by a
 * trigger) and every transaction must balance (deferred constraint trigger), see migration 0002. Migration
 * 0004 (ADR-0026, audit D6) makes ledger_transactions append only too and lets credit_lots change only in
 * remaining_credits.
 */
export const ledgerAccountKind = pgEnum('ledger_account_kind', [
  'kullanici_cuzdani',
  'ertelenmis_gelir',
  'promosyon_havuzu',
  'tuketim',
  'iade',
  'rezervasyon',
]);
export const lotSource = pgEnum('lot_source', ['promosyon', 'abonelik', 'paket', 'iap']);
export const entrySide = pgEnum('entry_side', ['borc', 'alacak']);

export const wallets = pgTable('wallets', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  balanceSnapshot: bigint('balance_snapshot', { mode: 'number' }).notNull().default(0),
  snapshotAt: ts('snapshot_at'),
  createdAt: createdAt(),
});

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: id(),
    kind: ledgerAccountKind('kind').notNull(),
    walletId: uuid('wallet_id').references(() => wallets.id),
    code: text('code').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('ledger_accounts_code_uq').on(t.code)],
);

export const creditLots = pgTable(
  'credit_lots',
  {
    id: id(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    source: lotSource('source').notNull(),
    originalCredits: integer('original_credits').notNull(),
    remainingCredits: integer('remaining_credits').notNull(),
    expiresAt: ts('expires_at'),
    originRef: text('origin_ref').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('credit_lots_origin_uq').on(t.originRef),
    index('credit_lots_consume_idx').on(t.walletId, t.expiresAt),
    check('credit_lots_promo_expiry', sql`(${t.source} = 'promosyon') = (${t.expiresAt} is not null)`),
    check(
      'credit_lots_nonneg',
      sql`${t.remainingCredits} >= 0 and ${t.remainingCredits} <= ${t.originalCredits}`,
    ),
  ],
);

/**
 * One row per business transaction. Request idempotency lives here (one key, one transaction), so a single
 * spend may touch several lots and accounts without colliding on a per entry unique key.
 */
export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: id(),
    kind: text('kind').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    reversesTransactionId: uuid('reverses_transaction_id'),
    /** Wallet the transaction belongs to, for the wallet movement list in one query (v1.1, null for pools). */
    walletId: uuid('wallet_id').references(() => wallets.id),
    memo: text('memo'),
    createdAt: createdAt(),
  },
  (t) => [index('ledger_transactions_wallet_idx').on(t.walletId, t.createdAt)],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => ledgerTransactions.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id),
    side: entrySide('side').notNull(),
    credits: integer('credits').notNull(),
    lotId: uuid('lot_id').references(() => creditLots.id),
    kind: text('kind').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_entries_tx_idx').on(t.transactionId),
    index('ledger_entries_account_idx').on(t.accountId, t.createdAt),
    index('ledger_entries_lot_idx').on(t.lotId),
    check('ledger_entries_positive', sql`${t.credits} > 0`),
  ],
);

export const reservationStatus = pgEnum('reservation_status', ['acik', 'tuketildi', 'cozuldu']);
export const reservations = pgTable(
  'reservations',
  {
    id: id(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    operationId: text('operation_id').notNull(),
    estimatedCredits: integer('estimated_credits').notNull(),
    actualCredits: integer('actual_credits'),
    status: reservationStatus('status').notNull().default('acik'),
    expiresAt: ts('expires_at')
      .notNull()
      .default(sql`now() + interval '5 minutes'`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('reservations_op_uq').on(t.operationId)],
);

export const priceTables = pgTable('price_tables', {
  id: id(),
  version: text('version').notNull().unique(),
  effectiveFrom: ts('effective_from').notNull(),
  operations: jsonb('operations').$type<Record<string, number>>().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
});

/**
 * One row per product and price table version (audit D4, ADR-0027). Code alone is not unique.
 * Orders and subscriptions keep the immutable product id of the version originally sold.
 */
export const products = pgTable(
  'products',
  {
    id: id(),
    code: text('code').notNull(),
    kind: text('kind').notNull(),
    priceTableId: uuid('price_table_id')
      .notNull()
      .references(() => priceTables.id),
    priceKurus: integer('price_kurus').notNull(),
    credits: integer('credits'),
    monthlyCredits: integer('monthly_credits'),
    appleProductId: text('apple_product_id'),
    iyzicoPlanRef: text('iyzico_plan_ref'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('products_code_price_table_uq').on(t.code, t.priceTableId)],
);

export const coupons = pgTable('coupons', {
  id: id(),
  code: text('code').notNull().unique(),
  credits: integer('credits'),
  percentOff: integer('percent_off'),
  maxRedemptions: integer('max_redemptions'),
  redeemed: integer('redeemed').notNull().default(0),
  validUntil: ts('valid_until'),
  createdAt: createdAt(),
});

export const orders = pgTable(
  'orders',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    couponId: uuid('coupon_id').references(() => coupons.id),
    amountKurus: integer('amount_kurus').notNull(),
    status: text('status').notNull().default('bekliyor'),
    idempotencyKey: text('idempotency_key').notNull(),
    consentVersions: jsonb('consent_versions').notNull(),
    /** iyzico checkout form token, used to re-query the payment on return (plan 9.2/1). */
    checkoutToken: text('checkout_token'),
    providerPaymentId: text('provider_payment_id'),
    paidAt: ts('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_idem_uq').on(t.userId, t.idempotencyKey),
    uniqueIndex('orders_checkout_token_uq')
      .on(t.checkoutToken)
      .where(sql`${t.checkoutToken} is not null`),
  ],
);

/**
 * Provider money movements: payments (kind odeme) and refunds (kind iade). A renewal charge has a subscription
 * and no order. One charge per (provider, provider_payment_id); refunds of the same charge are told apart by
 * refund_ref (provider refund id or our refund idempotency key), unique per provider (ADR-0023).
 */
export const payments = pgTable(
  'payments',
  {
    id: id(),
    orderId: uuid('order_id').references(() => orders.id),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
    kind: text('kind').notNull().default('odeme'),
    provider: text('provider').notNull(),
    providerPaymentId: text('provider_payment_id').notNull(),
    refundRef: text('refund_ref'),
    amountKurus: integer('amount_kurus').notNull(),
    status: text('status').notNull(),
    raw: jsonb('raw'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payments_charge_uq')
      .on(t.provider, t.providerPaymentId)
      .where(sql`${t.kind} = 'odeme'`),
    uniqueIndex('payments_refund_uq')
      .on(t.provider, t.refundRef)
      .where(sql`${t.kind} = 'iade'`),
    index('payments_subscription_idx').on(t.subscriptionId),
    check('payments_kind', sql`${t.kind} in ('odeme', 'iade')`),
    check('payments_refund_ref', sql`(${t.kind} = 'iade') = (${t.refundRef} is not null)`),
    check('payments_owner', sql`${t.orderId} is not null or ${t.subscriptionId} is not null`),
    // contracts paymentStatuses (v1.2); added NOT VALID in 0004, so only new and changed rows are checked.
    check('payments_status', sql`${t.status} in (${inList(paymentStatuses)})`),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    channel: text('channel').notNull(),
    providerRef: text('provider_ref').notNull(),
    status: text('status').notNull(),
    currentPeriodStart: ts('current_period_start'),
    currentPeriodEnd: ts('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: ts('canceled_at'),
    grantsDelivered: integer('grants_delivered').notNull().default(0),
    /** Price of the current period; a pending change applies from pending_price_effective_at (plan 4.5/9). */
    priceKurus: integer('price_kurus'),
    lastPaymentId: text('last_payment_id'),
    /** Dunning (plan 4.5/10: retries on day 1, 3 and 7 after the first failure). */
    firstFailureAt: ts('first_failure_at'),
    failedRetries: integer('failed_retries').notNull().default(0),
    failedOrderRef: text('failed_order_ref'),
    pendingPriceKurus: integer('pending_price_kurus'),
    pendingPriceEffectiveAt: ts('pending_price_effective_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('subscriptions_provider_uq').on(t.channel, t.providerRef)],
);

/** One redemption per user and coupon (plan 9.4). Credit coupons point at the ledger, discounts at the order. */
export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: id(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    ledgerTransactionId: uuid('ledger_transaction_id').references(() => ledgerTransactions.id),
    orderId: uuid('order_id').references(() => orders.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('coupon_redemptions_uq').on(t.couponId, t.userId),
    check('coupon_redemptions_target', sql`${t.ledgerTransactionId} is not null or ${t.orderId} is not null`),
  ],
);

/**
 * Scheduled billing notices (plan 4.5/8-9: 7 and 30 days before a charge, price change 30 days ahead).
 * Delivery is a notify.send job; (user_id, kind, ref) makes scheduling idempotent.
 */
export const notices = pgTable(
  'notices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    ref: text('ref').notNull(),
    sendAt: ts('send_at').notNull(),
    sentAt: ts('sent_at'),
    jobId: uuid('job_id'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('notices_uq').on(t.userId, t.kind, t.ref),
    index('notices_due_idx')
      .on(t.sendAt)
      .where(sql`${t.sentAt} is null`),
    // contracts noticeKinds (v1.2); added NOT VALID in 0004.
    check('notices_kind', sql`${t.kind} in (${inList(noticeKinds)})`),
  ],
);

export const invoices = pgTable('invoices', {
  id: id(),
  orderId: uuid('order_id').references(() => orders.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  number: text('number').notNull().unique(),
  kind: text('kind').notNull().default('satis'),
  totalKurus: integer('total_kurus').notNull(),
  providerRef: text('provider_ref'),
  pdfObjectKey: text('pdf_object_key'),
  issuedAt: ts('issued_at').notNull(),
});

export const refundRequests = pgTable('refund_requests', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  orderId: uuid('order_id').references(() => orders.id),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  reason: text('reason'),
  amountKurus: integer('amount_kurus'),
  status: text('status').notNull().default('bekliyor'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: ts('decided_at'),
  createdAt: createdAt(),
});

export const iapTransactions = pgTable(
  'iap_transactions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    transactionId: text('transaction_id').notNull(),
    originalTransactionId: text('original_transaction_id').notNull(),
    productId: text('product_id').notNull(),
    environment: text('environment').notNull(),
    revokedAt: ts('revoked_at'),
    signedPayload: text('signed_payload'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('iap_transactions_uq').on(t.transactionId)],
);

/** Every incoming provider event is stored once; (provider, event_id) is the idempotency key. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    payload: jsonb('payload').notNull(),
    processedAt: ts('processed_at'),
    error: text('error'),
    receivedAt: createdAt(),
  },
  (t) => [uniqueIndex('webhook_events_provider_event_uq').on(t.provider, t.eventId)],
);

/** Client request ids (Idempotency-Key header) per user and operation. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id),
    operation: text('operation').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('idempotency_keys_uq').on(t.userId, t.operation, t.key)],
);

/** Frozen order documents; contain personal data and stay in the restricted Turkish database. */
export const orderLegalDocuments = pgTable(
  'order_legal_documents',
  {
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    slug: text('slug').notNull(),
    version: text('version').notNull(),
    filledText: text('filled_text').notNull(),
    sha256: text('sha256').notNull(),
    sourceSha256: text('source_sha256'),
    fields: jsonb('fields').$type<Record<string, string>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.slug] }),
    index('order_legal_documents_user_idx').on(t.userId, t.orderId),
    check('order_legal_documents_slug', sql`${t.slug} in ('on-bilgilendirme', 'mesafeli-satis', 'abonelik')`),
    check(
      'order_legal_documents_hash',
      sql`${t.sha256} = encode(sha256(convert_to(${t.filledText}, 'UTF8')), 'hex')`,
    ),
    check(
      'order_legal_documents_source_hash',
      sql`${t.sourceSha256} is null or ${t.sourceSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'order_legal_documents_filled',
      sql`length(${t.filledText}) > 0 and position('{{' in ${t.filledText}) = 0 and position('[DOĞRULANACAK' in ${t.filledText}) = 0`,
    ),
    check('order_legal_documents_fields', sql`jsonb_typeof(${t.fields}) = 'object'`),
  ],
);

/** Written only after the real email provider accepts the complete, frozen document set. */
export const orderLegalDocumentDeliveries = pgTable(
  'order_legal_document_deliveries',
  {
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    providerMessageId: text('provider_message_id').notNull(),
    deliveredAt: ts('delivered_at').notNull(),
  },
  (t) => [check('order_legal_deliveries_message', sql`length(trim(${t.providerMessageId})) > 0`)],
);
