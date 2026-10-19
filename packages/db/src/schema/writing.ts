import { boolean, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { createdAt, id, ts, updatedAt } from './_common.ts';

export const institutionProfiles = pgTable('institution_profiles', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  createdAt: createdAt(),
});

/** Rules extracted from a thesis guide; user scoped until approved by an editor. */
export const templateRules = pgTable('template_rules', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  institutionId: uuid('institution_id').references(() => institutionProfiles.id),
  sourceObjectKey: text('source_object_key'),
  rules: jsonb('rules').notNull(),
  model: text('model'),
  approved: boolean('approved').notNull().default(false),
  createdAt: createdAt(),
});

export const templateRuleEvidence = pgTable('template_rule_evidence', {
  id: id(),
  templateRuleId: uuid('template_rule_id')
    .notNull()
    .references(() => templateRules.id, { onDelete: 'cascade' }),
  ruleKey: text('rule_key').notNull(),
  excerpt: text('excerpt').notNull(),
  page: integer('page'),
});

export const journals = pgTable(
  'journals',
  {
    id: id(),
    name: text('name').notNull(),
    issn: text('issn'),
    eissn: text('eissn'),
    publisher: text('publisher'),
    url: text('url'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('journals_issn_uq').on(t.issn)],
);

export const journalRuleVersions = pgTable(
  'journal_rule_versions',
  {
    id: id(),
    journalId: uuid('journal_id')
      .notNull()
      .references(() => journals.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    rules: jsonb('rules').notNull(),
    sourceUrl: text('source_url'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: ts('approved_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('journal_rule_versions_uq').on(t.journalId, t.version)],
);

export const writingProjects = pgTable(
  'writing_projects',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind').notNull(),
    targetWords: integer('target_words').notNull().default(0),
    currentWords: integer('current_words').notNull().default(0),
    deadline: date('deadline'),
    templateRuleId: uuid('template_rule_id').references(() => templateRules.id),
    journalRuleVersionId: uuid('journal_rule_version_id').references(() => journalRuleVersions.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('writing_projects_user_idx').on(t.userId)],
);

export const writingLogs = pgTable('writing_logs', {
  id: id(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => writingProjects.id, { onDelete: 'cascade' }),
  words: integer('words').notNull(),
  source: text('source').notNull().default('manuel'),
  note: text('note'),
  loggedOn: date('logged_on').notNull(),
  createdAt: createdAt(),
});

export const reminders = pgTable('reminders', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => writingProjects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  cron: text('cron'),
  nextAt: ts('next_at'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: createdAt(),
});
