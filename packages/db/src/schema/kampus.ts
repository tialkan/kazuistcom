import { index, integer, pgSchema, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { createdAt, id, ts, updatedAt } from './_common.ts';

/** Turkuaz Kampus lives in its own PostgreSQL schema (plan K-14). */
export const kampus = pgSchema('kampus');

export const kampusPostKind = kampus.enum('post_kind', ['makale', 'tez', 'bildiri', 'poster', 'not']);
export const kampusRequestStatus = kampus.enum('request_status', ['bekliyor', 'kabul', 'ret']);

export const kampusProfiles = kampus.table(
  'profiles',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    institution: text('institution'),
    bio: text('bio'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('kampus_profiles_user_uq').on(t.userId)],
);

export const kampusFiles = kampus.table('files', {
  id: id(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => kampusProfiles.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  scanStatus: text('scan_status').notNull().default('bekliyor'),
  /** Temporary hiding after a takedown request (FR-108, ADR-0023). */
  hiddenAt: ts('hidden_at'),
  createdAt: createdAt(),
});

export const kampusPosts = kampus.table(
  'posts',
  {
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => kampusProfiles.id, { onDelete: 'cascade' }),
    kind: kampusPostKind('kind').notNull(),
    title: text('title').notNull(),
    abstract: text('abstract'),
    fileId: uuid('file_id').references(() => kampusFiles.id),
    /** Temporary hiding after a takedown request (FR-108, ADR-0023). */
    hiddenAt: ts('hidden_at'),
    createdAt: createdAt(),
  },
  (t) => [index('kampus_posts_profile_idx').on(t.profileId, t.createdAt)],
);

export const kampusFollows = kampus.table(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => kampusProfiles.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => kampusProfiles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] })],
);

export const kampusSummaries = kampus.table('summaries', {
  id: id(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => kampusFiles.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  model: text('model'),
  createdAt: createdAt(),
});

export const kampusPosters = kampus.table('posters', {
  id: id(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => kampusFiles.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  createdAt: createdAt(),
});

export const kampusFulltextRequests = kampus.table('fulltext_requests', {
  id: id(),
  postId: uuid('post_id')
    .notNull()
    .references(() => kampusPosts.id, { onDelete: 'cascade' }),
  requesterId: uuid('requester_id')
    .notNull()
    .references(() => kampusProfiles.id, { onDelete: 'cascade' }),
  message: text('message'),
  status: kampusRequestStatus('status').notNull().default('bekliyor'),
  createdAt: createdAt(),
});

export const kampusReports = kampus.table('reports', {
  id: id(),
  reporterId: uuid('reporter_id')
    .notNull()
    .references(() => users.id),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(),
  createdAt: createdAt(),
});
