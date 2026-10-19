import { jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { records } from './corpus.ts';
import { createdAt, id, updatedAt } from './_common.ts';

export const libraryItems = pgTable(
  'library_items',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recordId: uuid('record_id')
      .notNull()
      .references(() => records.id),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('library_items_uq').on(t.userId, t.recordId)],
);

export const guideProgress = pgTable(
  'guide_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guideId: text('guide_id').notNull(),
    completedSteps: jsonb('completed_steps').$type<string[]>().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.guideId] })],
);
