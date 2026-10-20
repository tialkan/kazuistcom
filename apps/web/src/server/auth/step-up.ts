import { and, desc, eq, gt } from './orm.ts';
import { writeAudit } from './audit.ts';
import type { Db } from './db.ts';
import { schema } from './db.ts';
import { codeHash, safeEqualHex, sixDigitCode } from './hash.ts';
import type { Mailer } from './mailer.ts';

/**
 * Admin step up (plan 5.6/2): the session must have been opened with a passkey, and a second
 * step (an e-mail code bound to that session) must be fresh.
 *
 * Temporary: the schema has no two factor table, so both markers are rows in `verifications`
 * keyed by session id. See docs/istekler/kimlik-iki-adim-tablosu.md.
 */
export const PASSKEY_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SECOND_STEP_TTL_MS = 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;

export const passkeySessionId = (sessionId: string) => `kz:passkey-session:${sessionId}`;
const secondStepCodeId = (sessionId: string) => `kz:admin-code:${sessionId}`;
const secondStepDoneId = (sessionId: string) => `kz:admin-2fa:${sessionId}`;

async function freshRow(db: Db, identifier: string, now: Date) {
  const [row] = await db
    .select()
    .from(schema.verifications)
    .where(and(eq(schema.verifications.identifier, identifier), gt(schema.verifications.expiresAt, now)))
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);
  return row;
}

export async function hasPasskeySession(db: Db, sessionId: string, userId: string, now: Date) {
  const row = await freshRow(db, passkeySessionId(sessionId), now);
  return !!row && row.value === userId;
}

export async function hasSecondStep(db: Db, sessionId: string, userId: string, now: Date) {
  const row = await freshRow(db, secondStepDoneId(sessionId), now);
  return !!row && row.value === userId;
}

export async function startSecondStep(
  db: Db,
  mailer: Mailer,
  secret: string,
  sessionId: string,
  email: string,
  now: Date,
) {
  const code = sixDigitCode();
  await db.insert(schema.verifications).values({
    identifier: secondStepCodeId(sessionId),
    value: codeHash(secret, secondStepCodeId(sessionId), code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  });
  await mailer.sendCode(email, 'admin-step-up', code);
}

export async function confirmSecondStep(
  db: Db,
  secret: string,
  sessionId: string,
  userId: string,
  code: string,
  now: Date,
): Promise<boolean> {
  const row = await freshRow(db, secondStepCodeId(sessionId), now);
  if (!row || !safeEqualHex(row.value, codeHash(secret, secondStepCodeId(sessionId), code))) return false;
  await db.delete(schema.verifications).where(eq(schema.verifications.id, row.id));
  await db.insert(schema.verifications).values({
    identifier: secondStepDoneId(sessionId),
    value: userId,
    expiresAt: new Date(now.getTime() + SECOND_STEP_TTL_MS),
  });
  await writeAudit(db, secret, {
    actorId: userId,
    action: 'admin.step_up',
    subjectType: 'session',
    subjectId: sessionId,
  });
  return true;
}
