import { boolean, index, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { createdAt, id, updatedAt } from './_common.ts';

export const consentKind = pgEnum('consent_kind', [
  'aydinlatma',
  'acik_riza_analitik',
  'acik_riza_pazarlama',
  'kullanim_kosullari',
  'on_bilgilendirme',
  'mesafeli_sozlesme',
  'cayma_istisnasi',
  'yz_aktarim',
]);

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
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: consentKind('kind').notNull(),
    version: text('version').notNull(),
    granted: boolean('granted').notNull(),
    context: jsonb('context'),
    createdAt: createdAt(),
  },
  (t) => [index('consents_user_kind_idx').on(t.userId, t.kind)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id'),
    reason: text('reason'),
    diff: jsonb('diff'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_subject_idx').on(t.subjectType, t.subjectId)],
);
