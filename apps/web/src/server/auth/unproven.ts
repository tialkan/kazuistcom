import { getSessionFromCtx } from 'better-auth/api';
import { and, eq, ne } from 'drizzle-orm';
import { writeAudit } from './audit.ts';
import { schema, type Db } from './db.ts';

/**
 * Account pre-hijacking guard. E-mail and password sign up does not require a verified address, so anyone can
 * open an account on someone else's e-mail and keep a password, sessions, a passkey or a TOTP secret on it. When
 * the mailbox owner first proves control of the address, nothing that predates the proof may stay usable.
 *
 * Better Auth 1.7.11 already strips accounts and sessions on the e-mail code sign in (revokeUnprovenAccountAccess)
 * and refuses to link Google or Apple to an unverified local account (requireLocalEmailVerified, pinned in
 * auth.ts). It leaves passkeys and the TOTP secret on the e-mail code sign in, and does nothing on
 * /email-otp/verify-email or /email-otp/reset-password. This runs in the users update.before hook, where the
 * code has already been checked and the row still shows emailVerified false.
 */

interface EndpointCtx {
  path?: string;
  body?: unknown;
}

export type ProofPath = '/sign-in/email-otp' | '/email-otp/verify-email' | '/email-otp/reset-password';
const proofPaths = new Set<string>([
  '/sign-in/email-otp',
  '/email-otp/verify-email',
  '/email-otp/reset-password',
]);

/** What a first proof of the address removes, per endpoint. */
export interface StripPlan {
  /** Delete the credential (password) account. False on a reset, which has just written the new password. */
  password: boolean;
  /** Delete Google or Apple links made before the proof. */
  oauth: boolean;
  passkeys: boolean;
  totp: boolean;
  /** Sessions to revoke: every one, or every one except the caller's own. */
  sessions: 'all' | 'others' | 'none';
}

/**
 * - /sign-in/email-otp: everything (Better Auth removed accounts and sessions; passkeys and TOTP remain).
 * - /email-otp/reset-password: everything except the new password (sessions were revoked by the reset).
 * - /email-otp/verify-email from a session of the same account: the caller set the password and holds the code,
 *   so it is the owner; only the other sessions go. Without such a session: everything.
 */
export function stripPlan(path: ProofPath, sameUserSession: boolean): StripPlan {
  if (path === '/email-otp/verify-email' && sameUserSession)
    return { password: false, oauth: false, passkeys: false, totp: false, sessions: 'others' };
  return {
    password: path !== '/email-otp/reset-password',
    oauth: true,
    passkeys: true,
    totp: true,
    sessions: path === '/email-otp/reset-password' ? 'none' : 'all',
  };
}

/**
 * Called with the data of a users update. Returns the data to write (twoFactorEnabled cleared when the TOTP
 * secret goes) or undefined to leave it unchanged.
 */
export async function stripUnprovenAccess(
  db: Db,
  secret: string,
  data: Record<string, unknown>,
  ctx: EndpointCtx | null | undefined,
): Promise<Record<string, unknown> | undefined> {
  if (data.emailVerified !== true || !ctx?.path || !proofPaths.has(ctx.path)) return undefined;
  const raw = (ctx.body as { email?: unknown } | undefined)?.email;
  if (typeof raw !== 'string') return undefined;
  const [user] = await db
    .select({ id: schema.users.id, emailVerified: schema.users.emailVerified })
    .from(schema.users)
    .where(eq(schema.users.email, raw.trim().toLowerCase()));
  if (!user || user.emailVerified) return undefined;

  let currentSessionId: string | null = null;
  if (ctx.path === '/email-otp/verify-email') {
    const s = await getSessionFromCtx(ctx as Parameters<typeof getSessionFromCtx>[0]).catch(() => null);
    if (s && s.user.id === user.id) currentSessionId = s.session.id;
  }
  const plan = stripPlan(ctx.path as ProofPath, currentSessionId !== null);
  const A = schema.accounts;
  if (plan.password) await db.delete(A).where(and(eq(A.userId, user.id), eq(A.providerId, 'credential')));
  if (plan.oauth) await db.delete(A).where(and(eq(A.userId, user.id), ne(A.providerId, 'credential')));
  if (plan.passkeys) await db.delete(schema.passkeys).where(eq(schema.passkeys.userId, user.id));
  if (plan.totp) await db.delete(schema.twoFactors).where(eq(schema.twoFactors.userId, user.id));
  const S = schema.sessions;
  if (plan.sessions === 'all') await db.delete(S).where(eq(S.userId, user.id));
  else if (plan.sessions === 'others' && currentSessionId)
    await db.delete(S).where(and(eq(S.userId, user.id), ne(S.id, currentSessionId)));

  await writeAudit(db, secret, {
    actorId: user.id,
    action: 'user.unproven_access_revoked',
    subjectType: 'user',
    subjectId: user.id,
    diff: { path: ctx.path, ...plan },
  });
  return plan.totp ? { ...data, twoFactorEnabled: false } : undefined;
}
