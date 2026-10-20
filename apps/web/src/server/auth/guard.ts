import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { eq } from './orm.ts';
import { getAuthContext, type AuthContext } from './context.ts';
import { schema } from './db.ts';
import { apiError, rateLimited } from './http.ts';
import { clientIp, type RateRule } from './rate-limit.ts';
import { hasAnyRole, isRole, type Role } from './roles.ts';
import { hasPasskeySession, hasSecondStep } from './step-up.ts';

export interface Principal {
  userId: string;
  sessionId: string;
  email: string;
  roles: Role[];
}

export interface GuardOptions {
  /** Any of these roles is enough; empty means any signed in user. */
  roles?: Role[];
  /** Admin endpoints: role yonetici, a passkey session and a fresh second step (plan 5.6/2). */
  admin?: boolean;
  /** Rate rule keyed by user id. */
  rate?: RateRule;
}

export type Handler = (req: Request, p: Principal, ctx: AuthContext) => Promise<Response>;

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
    .select({ deletedAt: schema.users.deletedAt })
    .from(schema.users)
    .where(eq(schema.users.id, s.user.id));
  if (!u || u.deletedAt) return null;
  return {
    userId: s.user.id,
    sessionId: s.session.id,
    email: s.user.email,
    roles: await loadRoles(ctx, s.user.id),
  };
}

/** Server side authorization wrapper for every account route. */
export function withAuth(opts: GuardOptions, handler: Handler) {
  return async (req: Request): Promise<Response> => {
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
      const now = ctx.now();
      const ok =
        p.roles.includes('yonetici') &&
        (await hasPasskeySession(ctx.db, p.sessionId, p.userId, now)) &&
        (await hasSecondStep(ctx.db, p.sessionId, p.userId, now));
      if (!ok) return apiError('forbidden', tr.hata.ikinciAdim);
    }
    try {
      return await handler(req, p, ctx);
    } catch {
      return apiError('internal');
    }
  };
}

/** Public routes: rate limited by client IP. */
export function withPublic(rate: RateRule, handler: (req: Request, ctx: AuthContext) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const ctx = await getAuthContext();
    const d = await ctx.limiter.check(rate, clientIp(req.headers, ctx.config.trustedProxies));
    if (!d.ok) return rateLimited(d.retryAfterSec);
    return handler(req, ctx);
  };
}
