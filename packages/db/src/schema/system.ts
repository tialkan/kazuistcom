import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  uniqueIndex,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  jobStates,
  jobTypes,
  takedownKinds,
  takedownTargetTypes,
  type NotificationPrefsColumn,
} from '@kazuist/contracts';
import { users } from './auth.ts';
import { records } from './corpus.ts';
import { createdAt, id, ts, updatedAt } from './_common.ts';

export const jobType = pgEnum('job_type', jobTypes);
export const jobStatus = pgEnum('job_status', jobStates);

/** Job queue contract (plan Ek C.3). Consumers: see src/jobs.ts. */
export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    type: jobType('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: jobStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAfter: ts('run_after').notNull().defaultNow(),
    lockedBy: text('locked_by'),
    lockedAt: ts('locked_at'),
    result: jsonb('result'),
    error: text('error'),
    dedupeKey: text('dedupe_key'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('jobs_ready_idx')
      .on(t.type, t.runAfter)
      .where(sql`${t.status} = 'queued'`),
    uniqueIndex('jobs_dedupe_active_uq')
      .on(t.type, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null and ${t.status} in ('queued', 'running')`),
    // v1.5 (ADR-0035): enqueueOnceSql looks for the key in every state; pruneJobsSql scans finished rows.
    index('jobs_dedupe_idx')
      .on(t.type, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    index('jobs_finished_idx')
      .on(t.status, t.updatedAt)
      .where(sql`${t.status} in ('done', 'failed', 'dead')`),
  ],
);

/**
 * Per channel delivery record of a notify.send job (v1.5, ADR-0035, docs/istekler/kimlik-p7-bildirim-idempotency.md).
 * A retry sends only to the targets without a row. target_hash is 'email' for the e-mail channel and otherwise the
 * keyed hash (HMAC-SHA256, lower case hex) of the push endpoint or device token; the raw value is never written.
 * Rows go with their job (ON DELETE CASCADE), so retention follows pruneJobsSql.
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    targetHash: text('target_hash').notNull(),
    deliveredAt: ts('delivered_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.channel, t.targetHash] }),
    // contracts notificationChannels; e-mail has one target per job, push targets are hashes.
    check('notification_deliveries_channel', sql`${t.channel} in ('email', 'web_push', 'apns')`),
    check(
      'notification_deliveries_target',
      sql`(${t.channel} = 'email' and ${t.targetHash} = 'email') or (${t.channel} <> 'email' and ${t.targetHash} ~ '^[0-9a-f]{64}$')`,
    ),
  ],
);

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  rolloutPercent: integer('rollout_percent').notNull().default(0),
  description: text('description'),
  updatedAt: updatedAt(),
});

export const notificationPrefs = pgTable('notification_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Each column: contracts NotificationPrefsColumn, { "<notification type>": boolean }. */
  email: jsonb('email').$type<NotificationPrefsColumn>().notNull().default({}),
  webPush: jsonb('web_push').$type<NotificationPrefsColumn>().notNull().default({}),
  apns: jsonb('apns').$type<NotificationPrefsColumn>().notNull().default({}),
  updatedAt: updatedAt(),
});

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    endpoint: text('endpoint').notNull(),
    keys: jsonb('keys'),
    environment: text('environment'),
    createdAt: createdAt(),
  },
  (t) => [
    index('push_subscriptions_user_idx').on(t.userId),
    // contracts pushChannels and apnsEnvironments; the environment is set for apns only.
    check(
      'push_subscriptions_channel_env',
      sql`(${t.channel} = 'web_push' and ${t.environment} is null) or (${t.channel} = 'apns' and ${t.environment} is not null and ${t.environment} in ('production', 'sandbox'))`,
    ),
  ],
);

export const takedownKind = pgEnum('takedown_kind', takedownKinds);
export const takedownTargetType = pgEnum('takedown_target_type', takedownTargetTypes);

/**
 * Removal requests (FR-79, FR-108, ADR-0023). target_type and target_id point at a record or a Kampus post or
 * file; record_id is kept from v1 and equals target_id for records (foreign key to records). hide_due_at is
 * the 72 hour hiding decision limit; due_at is the thirty day KVKK limit and is set for kisisel_veri only
 * (contracts takedownDeadlines). Statuses and decisions: contracts takedownStatuses, takedownDecisions.
 */
export const takedownRequests = pgTable(
  'takedown_requests',
  {
    id: id(),
    kind: takedownKind('kind').notNull().default('kisisel_veri'),
    targetType: takedownTargetType('target_type').notNull().default('record'),
    targetId: uuid('target_id').notNull(),
    recordId: uuid('record_id').references(() => records.id),
    requesterName: text('requester_name'),
    reason: text('reason').notNull(),
    rightsInfo: text('rights_info'),
    contactEmail: text('contact_email').notNull(),
    status: text('status').notNull().default('bekliyor'),
    hideDueAt: ts('hide_due_at')
      .notNull()
      .default(sql`now() + interval '72 hours'`),
    dueAt: ts('due_at'),
    hiddenAt: ts('hidden_at'),
    decision: text('decision'),
    decisionReason: text('decision_reason'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: ts('decided_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('takedown_requests_open_idx')
      .on(t.hideDueAt)
      .where(sql`${t.status} <> 'sonuclandi'`),
    index('takedown_requests_target_idx').on(t.targetType, t.targetId),
    check('takedown_requests_status', sql`${t.status} in ('bekliyor', 'gecici_gizlendi', 'sonuclandi')`),
    check(
      'takedown_requests_decision',
      sql`${t.decision} is null or ${t.decision} in ('kalici_kaldirma', 'ek_maskeleme', 'ret')`,
    ),
    check(
      'takedown_requests_record_target',
      sql`(${t.targetType} = 'record') = (${t.recordId} is not null) and (${t.recordId} is null or ${t.recordId} = ${t.targetId})`,
    ),
  ],
);

export const evalRuns = pgTable('eval_runs', {
  id: id(),
  suite: text('suite').notNull(),
  gitCommit: text('git_commit'),
  metrics: jsonb('metrics').notNull(),
  passed: boolean('passed').notNull(),
  createdAt: createdAt(),
});

export const providerCosts = pgTable(
  'provider_costs',
  {
    id: id(),
    day: date('day').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    requests: integer('requests').notNull().default(0),
    abstentions: integer('abstentions').notNull().default(0),
  },
  (t) => [index('provider_costs_day_idx').on(t.day, t.provider, t.model, t.operation)],
);
