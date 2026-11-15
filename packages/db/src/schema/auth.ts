import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, ts, updatedAt } from './_common.ts';

/** Better Auth core tables (shape owned by Better Auth; ids are uuid). */
export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    image: text('image'),
    /** Better Auth two-factor plugin (TOTP for the admin panel, plan 5.6/2, ADR-0023). */
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    deletedAt: ts('deleted_at'),
    /** Frozen account deletion refund choice; reconciliation must preserve an explicit opt-out. */
    deletionRequestRefund: boolean('deletion_request_refund').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: ts('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    /** How the session was opened; values in contracts authMethods. The admin panel requires passkey. */
    authMethod: text('auth_method'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.token), index('sessions_user_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('accounts_provider_uq').on(t.providerId, t.accountId)],
);

export const passkeys = pgTable('passkeys', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  credentialId: text('credential_id').notNull().unique(),
  counter: integer('counter').notNull().default(0),
  deviceType: text('device_type'),
  backedUp: boolean('backed_up').notNull().default(false),
  transports: text('transports'),
  aaguid: text('aaguid'),
  createdAt: createdAt(),
});

export const verifications = pgTable(
  'verifications',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

/**
 * Better Auth two-factor plugin table (model twoFactor, plural two_factors; fields from better-auth 1.7.11
 * dist/plugins/two-factor/schema.mjs). secret and backup_codes are stored encrypted by Better Auth
 * (symmetricEncrypt with the auth secret; storeBackupCodes: encrypted is the default).
 */
export const twoFactors = pgTable(
  'two_factors',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    verified: boolean('verified').notNull().default(true),
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: ts('locked_until'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('two_factors_user_uq').on(t.userId)],
);

export const eduVerifications = pgTable(
  'edu_verifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
    verifiedAt: ts('verified_at'),
    createdAt: createdAt(),
  },
  // v1.6 (ADR-0038): the edu_claims trigger and account.purge look rows up by user.
  (t) => [index('edu_verifications_user_idx').on(t.userId)],
);

/**
 * One account per edu.tr mailbox (v1.6, ADR-0038; plan 10.1/3). email is the mailbox in the form of the SQL
 * function edu_mailbox(text) (trimmed, lower case, trailing dots and the +tag of the local part removed; the same
 * rule as kimlik normalizeEduEmail), so the primary key admits one account per mailbox.
 *
 * Maintained only by the trigger edu_verifications_claim (migration 0008): a row of edu_verifications that is or
 * becomes verified claims its mailbox for its user; when the mailbox belongs to another account the statement
 * fails with SQLSTATE 23505 (unique_violation, constraint edu_claims_pkey) and no e-mail in the message. When the
 * last verified row of the owner for that mailbox is deleted or loses verified_at, the claim goes. Every writer of
 * edu_verifications (web, admin tool, script) is held to the rule.
 *
 * No foreign key to users on purpose: the claim follows the edu_verifications rows, which account.purge deletes and
 * which a users delete cascades to. verified_at is the newest verification of the owner for the mailbox.
 */
export const eduClaims = pgTable(
  'edu_claims',
  {
    email: text('email').primaryKey(),
    userId: uuid('user_id').notNull(),
    verifiedAt: ts('verified_at').notNull(),
  },
  (t) => [
    index('edu_claims_user_idx').on(t.userId),
    check('edu_claims_mailbox', sql`${t.email} = edu_mailbox(${t.email})`),
  ],
);

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  description: text('description').notNull(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id),
    grantedBy: uuid('granted_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);
