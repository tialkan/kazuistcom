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
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { createdAt, id, ts, updatedAt } from './_common.ts';

/**
 * Double entry credit ledger (plan 9.1). ledger_entries is append only (UPDATE and DELETE are blocked by a
 * trigger) and every transaction must balance (deferred constraint trigger), see migration 0002.
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
export const ledgerTransactions = pgTable('ledger_transactions', {
  id: id(),
  kind: text('kind').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  reversesTransactionId: uuid('reverses_transaction_id'),
  memo: text('memo'),
  createdAt: createdAt(),
});

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

export const products = pgTable('products', {
  id: id(),
  code: text('code').notNull().unique(),
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
});

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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('orders_idem_uq').on(t.userId, t.idempotencyKey)],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    provider: text('provider').notNull(),
    providerPaymentId: text('provider_payment_id').notNull(),
    amountKurus: integer('amount_kurus').notNull(),
    status: text('status').notNull(),
    raw: jsonb('raw'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('payments_provider_uq').on(t.provider, t.providerPaymentId)],
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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('subscriptions_provider_uq').on(t.channel, t.providerRef)],
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
