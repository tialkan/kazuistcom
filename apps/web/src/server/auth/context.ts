import { drizzle } from 'drizzle-orm/node-postgres';
import { sharedPool, sharedValkey } from '../deps.ts';
import { createAuth, noAccountHooks, type AccountHooks, type AuthConfig, type KazuistAuth } from './auth.ts';
import type { Db } from './db.ts';
import { schema } from './db.ts';
import { smtpMailer, unconfiguredMailer, type Mailer } from './mailer.ts';
import {
  MemoryRateLimitStore,
  RateLimiter,
  ValkeyRateLimitStore,
  type RateLimitStore,
} from './rate-limit.ts';

export interface AuthContext {
  db: Db;
  auth: KazuistAuth;
  limiter: RateLimiter;
  mailer: Mailer;
  config: AuthConfig;
  hooks: AccountHooks;
  now: () => Date;
}

export interface ContextDeps {
  db: Db;
  config: AuthConfig;
  mailer: Mailer;
  store?: RateLimitStore;
  hooks?: AccountHooks;
  now?: () => Date;
}

export function createAuthContext(deps: ContextDeps): AuthContext {
  return {
    db: deps.db,
    auth: createAuth(deps.db, deps.config, deps.mailer, deps.hooks ?? noAccountHooks),
    hooks: deps.hooks ?? noAccountHooks,
    limiter: new RateLimiter(deps.store ?? new MemoryRateLimitStore()),
    mailer: deps.mailer,
    config: deps.config,
    now: deps.now ?? (() => new Date()),
  };
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
    piiKey: env.PII_ENCRYPTION_KEY,
    purgeGraceDays: Math.min(30, Math.max(1, Number(env.ACCOUNT_PURGE_GRACE_DAYS ?? '14') || 14)),
  };
}

/** odeme's BillingService (docs/istekler/odeme-denetim-kapanisi.md D8, O9); loaded lazily. */
const billingHooks: AccountHooks = {
  async onSignup(userId) {
    const { getBillingService } = await import('../billing/context.ts');
    await (await getBillingService()).grantSignupPromo(userId);
  },
  async onDeletion(userId) {
    const { getBillingService } = await import('../billing/context.ts');
    await (await getBillingService()).onAccountDeletion(userId);
  },
};

let current: AuthContext | undefined;

/** Process wide context over the shared pool and Valkey client (server/deps.ts). */
export async function getAuthContext(): Promise<AuthContext> {
  if (!current) {
    const env = process.env;
    const db = drizzle(sharedPool(env.DATABASE_URL ?? ''), { schema }) as unknown as Db;
    const url = env.MAIL_SMTP_URL;
    current = createAuthContext({
      db,
      config: configFromEnv(env),
      mailer: url ? smtpMailer(url) : unconfiguredMailer,
      store: env.VALKEY_URL ? new ValkeyRateLimitStore(sharedValkey(env.VALKEY_URL)) : undefined,
      hooks: billingHooks,
    });
  }
  return current;
}

/** Tests replace the process context. */
export function setAuthContext(ctx: AuthContext | undefined): void {
  current = ctx;
}
