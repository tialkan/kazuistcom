import { boolean, index, integer, jsonb, pgTable, real, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { records } from './corpus.ts';
import { createdAt, id, ts } from './_common.ts';

export const decks = pgTable('decks', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  subject: text('subject'),
  hmgs: boolean('hmgs').notNull().default(false),
  ownerId: uuid('owner_id').references(() => users.id),
  published: boolean('published').notNull().default(false),
  createdAt: createdAt(),
});

export const cards = pgTable(
  'cards',
  {
    id: id(),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    sourceRecordId: uuid('source_record_id').references(() => records.id),
    approved: boolean('approved').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('cards_deck_idx').on(t.deckId)],
);

export const cardVersions = pgTable(
  'card_versions',
  {
    id: id(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    front: text('front').notNull(),
    back: text('back'),
    choices: jsonb('choices').$type<string[]>(),
    answer: text('answer'),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('card_versions_uq').on(t.cardId, t.version)],
);

/** FSRS state per user and card (ts-fsrs Card fields). */
export const cardReviews = pgTable(
  'card_reviews',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    due: ts('due').notNull(),
    stability: real('stability').notNull(),
    difficulty: real('difficulty').notNull(),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    state: integer('state').notNull().default(0),
    lastReview: ts('last_review'),
    lastRating: integer('last_rating'),
  },
  (t) => [
    uniqueIndex('card_reviews_uq').on(t.userId, t.cardId),
    index('card_reviews_due_idx').on(t.userId, t.due),
  ],
);

export const exams = pgTable('exams', {
  id: id(),
  title: text('title').notNull(),
  cardIds: jsonb('card_ids').$type<string[]>().notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  published: boolean('published').notNull().default(false),
  createdAt: createdAt(),
});

export const examAttempts = pgTable('exam_attempts', {
  id: id(),
  examId: uuid('exam_id')
    .notNull()
    .references(() => exams.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  answers: jsonb('answers').notNull(),
  score: real('score').notNull(),
  bySubject: jsonb('by_subject'),
  createdAt: createdAt(),
});
