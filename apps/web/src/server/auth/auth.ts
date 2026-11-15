import { passkey } from '@better-auth/passkey';
import { authMethods, type AuthMethod } from '@kazuist/contracts';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { bearer } from 'better-auth/plugins/bearer';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { eq } from 'drizzle-orm';
import { writeAudit } from './audit.ts';
import type { Db } from './db.ts';
import { schema } from './db.ts';
import type { Mailer } from './mailer.ts';

export interface AuthConfig {
  secret: string;
  baseUrl: string;
  /** Extra origins allowed to call the auth handler (web origins only). */
  trustedOrigins: string[];
  production: boolean;
  /** Number of reverse proxies in front of the app (Coolify Traefik = 1). */
  trustedProxies: number;
  google?: { clientId: string; clientSecret: string };
  /** clientId is the Services ID; clientSecret the signed JWT; appBundleIdentifier for iOS id tokens. */
  apple?: { clientId: string; clientSecret: string; appBundleIdentifier?: string };
  /** 32 byte key (base64) for personal fields such as the identity number of a KVKK application. */
  piiKey?: string;
  /** Days between DELETE /v1/me and account.purge (ADR-0023: at most 30; Tarik decides, default 14). */
  purgeGraceDays: number;
}

interface HookCtx {
  path?: string;
  params?: Record<string, string>;
  body?: unknown;
}

/** sessions.auth_method from the Better Auth endpoint that opened the session. */
export function authMethodFor(ctx: HookCtx | null | undefined): AuthMethod | null {
  const path = ctx?.path ?? '';
  if (path === '/passkey/verify-authentication') return 'passkey';
  if (path === '/sign-in/email-otp' || path === '/email-otp/verify-email') return 'email_otp';
  if (path === '/sign-in/email' || path === '/sign-up/email' || path === '/two-factor/verify-totp')
    return 'password';
  const provider =
    path.startsWith('/callback/') || path.startsWith('/oauth2/callback/')
      ? ctx?.params?.id
      : path === '/sign-in/social'
        ? (ctx?.body as { provider?: string } | undefined)?.provider
        : undefined;
  if (provider && (authMethods as readonly string[]).includes(provider)) return provider as AuthMethod;
  return null;
}

/** Better Auth instance on the existing Drizzle schema. */
/** Cross module account events (odeme: promo credits on sign up, cancellation and refunds on deletion). */
export interface AccountHooks {
  onSignup(userId: string): Promise<void>;
  onDeletion(userId: string, options?: { requestRefund: boolean }): Promise<void>;
}

export const noAccountHooks: AccountHooks = { onSignup: async () => {}, onDeletion: async () => {} };

/** Runs a hook without letting it fail the account flow; logs only the error class. */
export async function runHook(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(
      JSON.stringify({
        at: 'account-hook',
        level: 'error',
        hook: name,
        error: err instanceof Error ? err.name : 'Unknown',
      }),
    );
    return false;
  }
}

/**
 * Sign up promo credits only for a verified, not deleted account, read from the database rather than from the
 * hook argument. Idempotent in odeme (key kayit:<userId>), so a repeated user update grants nothing twice.
 */
export async function grantPromoIfVerified(db: Db, hooks: AccountHooks, userId: string): Promise<boolean> {
  const [u] = await db
    .select({ emailVerified: schema.users.emailVerified, deletedAt: schema.users.deletedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!u || !u.emailVerified || u.deletedAt) return false;
  return runHook('signup', () => hooks.onSignup(userId));
}

export function createAuth(db: Db, config: AuthConfig, mailer: Mailer, hooks: AccountHooks = noAccountHooks) {
  const rpID = new URL(config.baseUrl).hostname;
  const socialProviders: Record<string, unknown> = {};
  if (config.google) socialProviders.google = { ...config.google, prompt: 'select_account' };
  if (config.apple) socialProviders.apple = { ...config.apple };

  return betterAuth({
    appName: 'Kazuist',
    baseURL: config.baseUrl,
    basePath: '/api/auth',
    secret: config.secret,
    trustedOrigins: [
      config.baseUrl,
      ...config.trustedOrigins,
      ...(config.apple ? ['https://appleid.apple.com'] : []),
    ],
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
        passkeys: schema.passkeys,
        twoFactors: schema.twoFactors,
      },
    }),
    advanced: {
      database: { generateId: 'uuid' },
      cookiePrefix: 'kazuist',
      useSecureCookies: config.production,
      defaultCookieAttributes: { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' },
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      additionalFields: { authMethod: { type: 'string', required: false, input: false } },
    },
    /** Rate limiting is done in front of the handler with the shared Valkey limiter (rate-limit.ts). */
    rateLimit: { enabled: false },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // A reset by e-mail code ends every other session (stolen session after a password leak).
      revokeSessionsOnPasswordReset: true,
    },
    socialProviders,
    account: {
      accountLinking: { enabled: true, trustedProviders: ['google', 'apple'] },
      // Provider tokens are only used during sign in; they are kept encrypted at rest (hukuk-uyum madde 4).
      encryptOAuthTokens: true,
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({ email, otp, type }) {
          await mailer.sendCode(email, type, otp);
        },
      }),
      passkey({
        rpID,
        rpName: 'Kazuist',
        origin: new URL(config.baseUrl).origin,
        // Our schema property is credentialId (column credential_id); Better Auth calls it credentialID.
        schema: { passkey: { fields: { credentialID: 'credentialId' } } },
      }),
      // TOTP second step for the admin panel (plan 5.6/2). Passwordless so passkey only admins can enrol.
      twoFactor({ issuer: 'Kazuist', allowPasswordless: true }),
      bearer(),
      nextCookies(),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await db.insert(schema.profiles).values({ userId: user.id }).onConflictDoNothing();
            await db
              .insert(schema.userRoles)
              .values({ userId: user.id, roleId: 'kullanici' })
              .onConflictDoNothing();
            await db.insert(schema.notificationPrefs).values({ userId: user.id }).onConflictDoNothing();
            await writeAudit(db, config.secret, {
              actorId: user.id,
              action: 'user.created',
              subjectType: 'user',
              subjectId: user.id,
            });
            // 50 promo credits, once per user (key kayit:<userId>, idempotent in odeme), only for a verified
            // e-mail: Google and Apple accounts arrive verified, e-mail and password accounts get them below.
            await grantPromoIfVerified(db, hooks, user.id);
          },
        },
        update: {
          /** E-mail code verification (or a verified sign in code) is the moment an account earns the promo. */
          after: async (user) => {
            if (user?.emailVerified) await grantPromoIfVerified(db, hooks, user.id);
          },
        },
      },
      session: {
        create: {
          /** A deleted account cannot open sessions; every session records how it was opened. */
          before: async (session, ctx) => {
            const [u] = await db
              .select({ deletedAt: schema.users.deletedAt })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId));
            if (!u || u.deletedAt) return false;
            const prior = (session as { authMethod?: string | null }).authMethod ?? null;
            return { data: { ...session, authMethod: prior ?? authMethodFor(ctx as HookCtx | null) } };
          },
        },
      },
    },
  });
}

export type KazuistAuth = ReturnType<typeof createAuth>;
