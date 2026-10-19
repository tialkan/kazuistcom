import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

export const id = () => uuid('id').primaryKey().defaultRandom();
export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
export const ts = (name: string) => timestamp(name, { withTimezone: true });

/** PostgreSQL tsvector; values are produced by a generated column using the 'turkish' configuration. */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});
