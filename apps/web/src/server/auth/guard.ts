import { randomUUID } from 'node:crypto';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { eq } from 'drizzle-orm';
import { getAuthContext, type AuthContext } from './context.ts';
import { schema } from './db.ts';
import { apiError, rateLimited } from './http.ts';
import { safeErrorFields } from './log.ts';
import { clientIp, type RateRule } from './rate-limit.ts';
import { hasAnyRole, isRole, type Role } from './roles.ts';
import { hasPasskeySession, hasSecondStep } from './step-up.ts';

export interface Principal {
  userId: string;
  sessionId: string;
  email: string;
  /**
   * users.email_verified read from the database on every request. Sign in works without it; the free AI
   * allowance and the sign up promo credits require it (one free allowance per verified mailbox).
   */
  emailVerified: boolean;
  roles: Role[];
}

export interface GuardOptions {
  /** Any of these roles is enough; empty means any signed in user. */
  roles?: Role[];
  /**
   * Admin endpoints (plan 5.6/2, 10.9): one of these staff roles (true means yonetici only), a session
   * opened with a passkey and a TOTP second step verified for this session.
   */
  admin?: boolean | Role[];
  /** Rate rule keyed by user id. */
  rate?: RateRule;
}

/** Next.js route context; dynamic segments arrive as a promise. */
export interface RouteCtx {
  /** Next.js 16 passes `{ params: undefined }` to static routes and a promise to dynamic ones. */
  params?: Promise<Record<string, string | string[]>> | undefined;
}

export type Handler = (
  req: Request,
  p: Principal,
  ctx: AuthContext,
  params: Record<string, string>,
) => Promise<Response>;

async function flatParams(route?: RouteCtx): Promise<Record<string, string>> {
  const raw = (route?.params ? await route.params : undefined) ?? {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.join('/') : v]));
}

/** True when the principal may use admin endpoints right now. */
export async function adminAllowed(ctx: AuthContext, p: Principal, staff: Role[]): Promise<boolean> {
  return (
    hasAnyRole(p.roles, staff) &&
    (await hasPasskeySession(ctx.db, p.sessionId, p.userId)) &&
    (await hasSecondStep(ctx.db, p.sessionId, p.userId, ctx.now()))
  );
}

const unsafe = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Cookie authenticated writes must come from our own origin (CSRF, plan 5.6/3). Bearer clients are exempt. */
export function originAllowed(req: Request, ctx: AuthContext): boolean {
  if (!unsafe.has(req.method) || req.headers.get('authorization')?.startsWith('Bearer ')) return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const allowed = [new URL(ctx.config.baseUrl).origin, ...ctx.config.trustedOrigins];
  return allowed.includes(origin);
}

export async function loadRoles(ctx: AuthContext, userId: string): Promise<Role[]> {
  const rows = await ctx.db
    .select({ roleId: schema.userRoles.roleId })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.userId, userId));
  return rows.map((r) => r.roleId).filter(isRole);
}

/** Resolve the caller from the session cookie or the bearer token; null for misafir. */
export async function resolvePrincipal(req: Request, ctx: AuthContext): Promise<Principal | null> {
  const s = await ctx.auth.api.getSession({ headers: req.headers });
  if (!s) return null;
  const [u] = await ctx.db
    .select({ deletedAt: schema.users.deletedAt, emailVerified: schema.users.emailVerified })
    .from(schema.users)
    .where(eq(schema.users.id, s.user.id));
  if (!u || u.deletedAt) return null;
  return {
    userId: s.user.id,
    sessionId: s.session.id,
    email: s.user.email,
    emailVerified: u.emailVerified === true,
    roles: await loadRoles(ctx, s.user.id),
  };
}

/** Server side authorization wrapper for every account route. */
export function withAuth(opts: GuardOptions, handler: Handler) {
  return async (req: Request, route?: RouteCtx): Promise<Response> => {
    // Session lookup, limiter and admin checks are inside the catch too: an unhandled error would reach the
    // framework log with its raw message (Drizzle includes query parameters).
    try {
      const ctx = await getAuthContext();
      const p = await resolvePrincipal(req, ctx);
      if (!p) return apiError('unauthorized');
      if (!originAllowed(req, ctx)) return apiError('forbidden', tr.hata.kaynak);
      if (opts.rate) {
        const d = await ctx.limiter.check(opts.rate, p.userId);
        if (!d.ok) return rateLimited(d.retryAfterSec);
      }
      if (opts.roles && !hasAnyRole(p.roles, opts.roles)) return apiError('forbidden');
      if (opts.admin) {
        const staff: Role[] = opts.admin === true ? ['yonetici'] : opts.admin;
        if (!hasAnyRole(p.roles, staff)) return apiError('forbidden');
        if (!(await adminAllowed(ctx, p, staff))) return apiError('forbidden', tr.hata.ikinciAdim);
      }
      return await handler(req, p, ctx, await flatParams(route));
    } catch (err) {
      return internalError(req, err);
    }
  };
}

/**
 * Structured log of an unexpected error (plan 14.7): method, path, requestId and the sanitized error (class,
 * SQLSTATE, constraint, table, column; log.ts); no message, body, query, header or personal data. The same
 * requestId goes to the client.
 */
export function internalError(req: Request, err: unknown): Response {
  const requestId = randomUUID();
  console.error(
    JSON.stringify({
      at: 'api',
      level: 'error',
      method: req.method,
      path: new URL(req.url).pathname,
      requestId,
      ...safeErrorFields(err),
    }),
  );
  return apiError('internal', undefined, {}, requestId);
}

/**
 * Per IP limit. When the IP cannot be read (no proxy header) every such client shares one bucket, so it
 * gets a tenth of the limit and the event is logged (D-05).
 */
export async function checkIp(ctx: AuthContext, req: Request, rule: RateRule) {
  const ip = clientIp(req.headers, ctx.config.trustedProxies);
  if (ip !== 'unknown') return ctx.limiter.check(rule, ip);
  console.warn(JSON.stringify({ at: 'rate-limit', level: 'warn', rule: rule.name, ip: 'unknown' }));
  return ctx.limiter.check(
    {
      name: `${rule.name}-unknown`,
      limit: Math.max(1, Math.floor(rule.limit / 10)),
      windowSec: rule.windowSec,
    },
    'unknown',
  );
}

/** Public routes: rate limited by client IP. */
export function withPublic(rate: RateRule, handler: (req: Request, ctx: AuthContext) => Promise<Response>) {
  return async (req: Request, _route?: RouteCtx): Promise<Response> => {
    try {
      const ctx = await getAuthContext();
      const d = await checkIp(ctx, req, rate);
      if (!d.ok) return rateLimited(d.retryAfterSec);
      return await handler(req, ctx);
    } catch (err) {
      return internalError(req, err);
    }
  };
}
