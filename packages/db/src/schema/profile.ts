import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import {
  consentKinds,
  kvkkRelations,
  kvkkReplyChannels,
  kvkkRequestKinds,
  kvkkRequestStatuses,
  type ConsentContext,
} from '@kazuist/contracts';
import { users } from './auth.ts';
import { createdAt, id, ts, updatedAt } from './_common.ts';

/** Values come from contracts (append only); v1.1 added abonelik_sozlesmesi, yillik_taahhutname, yz_ucretsiz_katman. */
export const consentKind = pgEnum('consent_kind', consentKinds);

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  targetProfession: text('target_profession'),
  avatar: text('avatar'),
  tone: text('tone'),
  plan: text('plan').notNull().default('ucretsiz'),
  eduVerified: boolean('edu_verified').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Append only: each grant or withdrawal is a new row with the text version shown to the user. */
export const consents = pgTable(
  'consents',
  {
    id: id(),
    /** Null after account deletion; userHash keeps the proof of consent (KVKK, Mesafeli Sozlesmeler Yon.). */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    userHash: text('user_hash').notNull(),
    kind: consentKind('kind').notNull(),
    version: text('version').notNull(),
    granted: boolean('granted').notNull(),
    /** Shape: contracts ConsentContext, written by the server only. */
    context: jsonb('context').$type<ConsentContext>(),
    createdAt: createdAt(),
  },
  (t) => [index('consents_user_kind_idx').on(t.userId, t.kind)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorHash: text('actor_hash'),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id'),
    reason: text('reason'),
    diff: jsonb('diff'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_subject_idx').on(t.subjectType, t.subjectId)],
);

export const kvkkRequestKind = pgEnum('kvkk_request_kind', kvkkRequestKinds);
export const kvkkRequestStatus = pgEnum('kvkk_request_status', kvkkRequestStatuses);
export const kvkkRelation = pgEnum('kvkk_relation', kvkkRelations);
export const kvkkReplyChannel = pgEnum('kvkk_reply_channel', kvkkReplyChannels);

/**
 * KVKK m.11 applications (plan 10.10, ADR-0023). Signed in users and people without an account
 * (Teblig m.5 fields). due_at is the m.13/2 thirty day limit; it defaults from now() like received_at, and a
 * writer that sets received_at explicitly (postal application) must set due_at = received_at + 30 days
 * (contracts kvkkDueAt). Personal fields are kept only as long as the retention policy allows (hukuk-uyum).
 */
export const kvkkRequests = pgTable(
  'kvkk_requests',
  {
    id: id(),
    /** Null for applicants without an account and after the account is deleted. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** HMAC of the account id or of the contact e-mail; keeps the link after deletion (like consents). */
    requesterHash: text('requester_hash').notNull(),
    requesterName: text('requester_name'),
    /** ISO 3166-1 alpha-2. */
    nationality: text('nationality'),
    /** T.C. kimlik or passport number, encrypted by the application; never stored in clear. */
    identityEnc: text('identity_enc'),
    address: text('address'),
    contactEmail: text('contact_email').notNull(),
    phone: text('phone'),
    relation: kvkkRelation('relation').notNull().default('kullanici'),
    kind: kvkkRequestKind('kind').notNull(),
    detail: text('detail').notNull(),
    replyChannel: kvkkReplyChannel('reply_channel').notNull().default('eposta'),
    status: kvkkRequestStatus('status').notNull().default('alindi'),
    receivedAt: ts('received_at').notNull().defaultNow(),
    dueAt: ts('due_at')
      .notNull()
      .default(sql`now() + interval '30 days'`),
    verifiedAt: ts('verified_at'),
    decidedAt: ts('decided_at'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    /** What was answered (no copy of the personal data itself). */
    responseSummary: text('response_summary'),
    decisionReason: text('decision_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('kvkk_requests_open_idx')
      .on(t.dueAt)
      .where(sql`${t.status} in ('dogrulama_bekliyor', 'alindi', 'inceleniyor')`),
    index('kvkk_requests_user_idx').on(t.userId),
  ],
);
