import { and, desc, eq, gt } from 'drizzle-orm';
import { writeAudit } from './audit.ts';
import type { AuthContext } from './context.ts';
import type { Db } from './db.ts';
import { schema } from './db.ts';

/**
 * Admin step up (plan 5.6/2, ADR-0023): the session must have been opened with a passkey
 * (sessions.auth_method) and a TOTP code (Better Auth two-factor, two_factors table) must have been
 * verified for this session within SECOND_STEP_TTL_MS. Only that per session freshness marker lives in
 * verifications; the TOTP secret and its check belong to Better Auth.
 */
export const SECOND_STEP_TTL_MS = 60 * 60 * 1000;
const secondStepDoneId = (sessionId: string) => `kz:admin-2fa:${sessionId}`;

export async function hasPasskeySession(db: Db, sessionId: string, userId: string) {
  const [s] = await db
    .select({ userId: schema.sessions.userId, authMethod: schema.sessions.authMethod })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId));
  return !!s && s.userId === userId && s.authMethod === 'passkey';
}

export async function hasTotpEnabled(db: Db, userId: string) {
  const [u] = await db
    .select({ on: schema.users.twoFactorEnabled })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return u?.on === true;
}

export async function hasSecondStep(db: Db, sessionId: string, userId: string, now: Date) {
  const [row] = await db
    .select()
    .from(schema.verifications)
    .where(
      and(
        eq(schema.verifications.identifier, secondStepDoneId(sessionId)),
        gt(schema.verifications.expiresAt, now),
      ),
    )
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);
  return !!row && row.value === userId;
}

/**
 * Check the TOTP code with Better Auth (decrypts the stored secret, applies its attempt rules) and mark
 * this session as stepped up. Returns false on a wrong code.
 */
export async function confirmSecondStep(
  ctx: AuthContext,
  headers: Headers,
  sessionId: string,
  userId: string,
  code: string,
): Promise<boolean> {
  try {
    await ctx.auth.api.verifyTOTP({ body: { code }, headers });
  } catch {
    return false;
  }
  const now = ctx.now();
  await ctx.db.insert(schema.verifications).values({
    identifier: secondStepDoneId(sessionId),
    value: userId,
    expiresAt: new Date(now.getTime() + SECOND_STEP_TTL_MS),
  });
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId: userId,
    action: 'admin.step_up',
    subjectType: 'session',
    subjectId: sessionId,
  });
  return true;
}
