import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { bearer } from 'better-auth/plugins/bearer';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { eq } from './orm.ts';
import { writeAudit } from './audit.ts';
import type { Db } from './db.ts';
import { schema } from './db.ts';
import type { Mailer } from './mailer.ts';
import { PASSKEY_SESSION_TTL_MS, passkeySessionId } from './step-up.ts';

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
}

/** Better Auth instance on the existing Drizzle schema (users, sessions, accounts, passkeys, verifications). */
export function createAuth(db: Db, config: AuthConfig, mailer: Mailer) {
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
      },
    }),
    advanced: {
      database: { generateId: 'uuid' },
      cookiePrefix: 'kazuist',
      useSecureCookies: config.production,
      defaultCookieAttributes: { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' },
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    /** Rate limiting is done in front of the handler with the shared Valkey limiter (rate-limit.ts). */
    rateLimit: { enabled: false },
    emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128 },
    socialProviders,
    account: { accountLinking: { enabled: true, trustedProviders: ['google', 'apple'] } },
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
          },
        },
      },
      session: {
        create: {
          /** A deleted account (deletedAt set) cannot open new sessions. */
          before: async (session) => {
            const [u] = await db
              .select({ deletedAt: schema.users.deletedAt })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId));
            if (!u || u.deletedAt) return false;
            return { data: session };
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/passkey/verify-authentication') return;
        const created = ctx.context.newSession;
        if (!created) return;
        // Remember that this session was opened with a passkey (admin step up, plan 5.6/2).
        await db.insert(schema.verifications).values({
          identifier: passkeySessionId(created.session.id),
          value: created.user.id,
          expiresAt: new Date(Date.now() + PASSKEY_SESSION_TTL_MS),
        });
      }),
    },
  });
}

export type KazuistAuth = ReturnType<typeof createAuth>;
