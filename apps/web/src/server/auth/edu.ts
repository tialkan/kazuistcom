import { and, desc, eq, gt, isNotNull } from 'drizzle-orm';
import { writeAudit } from './audit.ts';
import type { Db } from './db.ts';
import { schema } from './db.ts';
import { codeHash, safeEqualHex, sixDigitCode } from './hash.ts';
import type { Mailer } from './mailer.ts';

export const EDU_CODE_TTL_MS = 10 * 60 * 1000;
export const EDU_MAX_ATTEMPTS = 5;
/** Verification is renewed yearly (plan 10.1/3). */
export const EDU_VALID_MS = 365 * 24 * 60 * 60 * 1000;

/** edu.tr itself and every sub domain (ogr.example.edu.tr, example.edu.tr). */
export function isEduTrEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.includes('..')) return false;
  return domain.endsWith('.edu.tr');
}

export function eduStillValid(verifiedAt: Date | null, now: Date): boolean {
  return !!verifiedAt && now.getTime() - verifiedAt.getTime() < EDU_VALID_MS;
}

export type EduStartResult = 'sent' | 'not_edu';

export async function startEduVerification(
  db: Db,
  mailer: Mailer,
  secret: string,
  userId: string,
  email: string,
  now: Date,
): Promise<EduStartResult> {
  if (!isEduTrEmail(email)) return 'not_edu';
  const code = sixDigitCode();
  const normalized = email.trim().toLowerCase();
  await db.insert(schema.eduVerifications).values({
    userId,
    email: normalized,
    codeHash: codeHash(secret, `edu:${userId}`, code),
    expiresAt: new Date(now.getTime() + EDU_CODE_TTL_MS),
  });
  await mailer.sendCode(normalized, 'edu', code);
  await writeAudit(db, secret, {
    actorId: userId,
    action: 'edu.start',
    subjectType: 'user',
    subjectId: userId,
  });
  return 'sent';
}

export type EduConfirmResult = 'verified' | 'invalid';

export async function confirmEduVerification(
  db: Db,
  secret: string,
  userId: string,
  code: string,
  now: Date,
): Promise<EduConfirmResult> {
  const [row] = await db
    .select()
    .from(schema.eduVerifications)
    .where(and(eq(schema.eduVerifications.userId, userId), gt(schema.eduVerifications.expiresAt, now)))
    .orderBy(desc(schema.eduVerifications.createdAt))
    .limit(1);
  if (!row || row.verifiedAt || row.attempts >= EDU_MAX_ATTEMPTS) return 'invalid';
  if (!safeEqualHex(row.codeHash, codeHash(secret, `edu:${userId}`, code))) {
    await db
      .update(schema.eduVerifications)
      .set({ attempts: row.attempts + 1 })
      .where(eq(schema.eduVerifications.id, row.id));
    return 'invalid';
  }
  await db.transaction(async (tx) => {
    await tx
      .update(schema.eduVerifications)
      .set({ verifiedAt: now })
      .where(eq(schema.eduVerifications.id, row.id));
    await tx
      .insert(schema.profiles)
      .values({ userId, eduVerified: true })
      .onConflictDoUpdate({ target: schema.profiles.userId, set: { eduVerified: true, updatedAt: now } });
    await tx.insert(schema.userRoles).values({ userId, roleId: 'ogrenci_dogrulanmis' }).onConflictDoNothing();
  });
  await writeAudit(db, secret, {
    actorId: userId,
    action: 'edu.verified',
    subjectType: 'user',
    subjectId: userId,
  });
  return 'verified';
}

/**
 * Yearly renewal: revoke the student role where the last verification is older than a year.
 * Meant for a daily job; returns the user ids that were revoked.
 */
export async function expireEduVerifications(db: Db, secret: string, now: Date): Promise<string[]> {
  const cutoff = new Date(now.getTime() - EDU_VALID_MS);
  const verified = await db
    .select({ userId: schema.profiles.userId })
    .from(schema.profiles)
    .where(eq(schema.profiles.eduVerified, true));
  const revoked: string[] = [];
  for (const { userId } of verified) {
    const [fresh] = await db
      .select({ id: schema.eduVerifications.id })
      .from(schema.eduVerifications)
      .where(
        and(
          eq(schema.eduVerifications.userId, userId),
          isNotNull(schema.eduVerifications.verifiedAt),
          gt(schema.eduVerifications.verifiedAt, cutoff),
        ),
      )
      .limit(1);
    if (fresh) continue;
    await db
      .update(schema.profiles)
      .set({ eduVerified: false, updatedAt: now })
      .where(eq(schema.profiles.userId, userId));
    await db
      .delete(schema.userRoles)
      .where(and(eq(schema.userRoles.userId, userId), eq(schema.userRoles.roleId, 'ogrenci_dogrulanmis')));
    await writeAudit(db, secret, {
      actorId: null,
      action: 'edu.expired',
      subjectType: 'user',
      subjectId: userId,
    });
    revoked.push(userId);
  }
  return revoked;
}
