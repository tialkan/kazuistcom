import { drizzleNodePg as drizzle } from './orm.ts';
import pg from 'pg';
import { createAuth, type AuthConfig, type KazuistAuth } from './auth.ts';
import type { Db } from './db.ts';
import { schema } from './db.ts';
import { smtpMailer, unconfiguredMailer, type Mailer } from './mailer.ts';
import { MemoryRateLimitStore, RateLimiter, type RateLimitStore } from './rate-limit.ts';
import { roleDescriptions } from './roles.ts';

export interface AuthContext {
  db: Db;
  auth: KazuistAuth;
  limiter: RateLimiter;
  mailer: Mailer;
  config: AuthConfig;
  now: () => Date;
}

export interface ContextDeps {
  db: Db;
  config: AuthConfig;
  mailer: Mailer;
  store?: RateLimitStore;
  now?: () => Date;
}

export function createAuthContext(deps: ContextDeps): AuthContext {
  return {
    db: deps.db,
    auth: createAuth(deps.db, deps.config, deps.mailer),
    limiter: new RateLimiter(deps.store ?? new MemoryRateLimitStore()),
    mailer: deps.mailer,
    config: deps.config,
    now: deps.now ?? (() => new Date()),
  };
}

/** Roles referenced by user_roles must exist; the migration does not seed them (see istek). */
export async function ensureRoles(db: Db): Promise<void> {
  await db
    .insert(schema.roles)
    .values(Object.entries(roleDescriptions).map(([id, description]) => ({ id, description })))
    .onConflictDoNothing();
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): AuthConfig {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  return {
    secret: need('BETTER_AUTH_SECRET'),
    baseUrl: need('BETTER_AUTH_URL'),
    trustedOrigins: (env.AUTH_TRUSTED_ORIGINS ?? '').split(',').filter(Boolean),
    production: env.NODE_ENV === 'production',
    trustedProxies: Number(env.TRUSTED_PROXY_COUNT ?? '1'),
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined,
    apple:
      env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
        ? {
            clientId: env.APPLE_CLIENT_ID,
            clientSecret: env.APPLE_CLIENT_SECRET,
            appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
          }
        : undefined,
  };
}

let current: AuthContext | undefined;
let rolesReady: Promise<void> | undefined;

/**
 * Process wide context. The Valkey store is wired by altyapi when the client lands (health
 * ping D4); until then the limiter is per process, which is documented in the PR.
 */
export async function getAuthContext(): Promise<AuthContext> {
  if (!current) {
    const db = drizzle(new pg.Pool({ connectionString: process.env.DATABASE_URL }), {
      schema,
    }) as unknown as Db;
    const url = process.env.MAIL_SMTP_URL;
    current = createAuthContext({
      db,
      config: configFromEnv(),
      mailer: url ? smtpMailer(url) : unconfiguredMailer,
    });
  }
  rolesReady ??= ensureRoles(current.db);
  await rolesReady;
  return current;
}

/** Tests replace the process context. */
export function setAuthContext(ctx: AuthContext | undefined): void {
  current = ctx;
  rolesReady = ctx ? ensureRoles(ctx.db) : undefined;
}
