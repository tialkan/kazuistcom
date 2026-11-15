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

/**
 * One verified account per mailbox. Lower case, trimmed, trailing dot of the domain removed and a sub address
 * (+etiket) dropped, since university mail servers deliver ali+1@ and ali@ to the same mailbox.
 */
export function normalizeEduEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  const local = e.slice(0, at).replace(/\+.*$/, '');
  const domain = e.slice(at + 1).replace(/\.$/, '');
  return `${local}@${domain}`;
}

/**
 * True when another account holds this mailbox. edu_claims (v1.6, ADR-0038) has one row per mailbox, written by the
 * edu_verifications_claim trigger for every verified row (also one older than a year: the owner renews on the same
 * account) and removed with the last verified row of the owner (account.purge). The migration back filled it.
 */
async function claimedByOther(db: Db, userId: string, normalized: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: schema.eduClaims.userId })
    .from(schema.eduClaims)
    .where(eq(schema.eduClaims.email, normalized))
    .limit(1);
  return !!row && row.userId !== userId;
}

/**
 * The edu_verifications_claim trigger refuses a verified row for a mailbox of another account with SQLSTATE 23505 on
 * edu_claims_pkey. node-postgres and PGlite put code and constraint on the error; Drizzle wraps it in cause.
 */
export function isEduClaimConflict(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; depth < 5 && e && typeof e === 'object'; depth++) {
    const { code, constraint, cause } = e as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (code === '23505' && constraint === 'edu_claims_pkey') return true;
    e = cause;
  }
  return false;
}

export function eduStillValid(verifiedAt: Date | null, now: Date): boolean {
  return !!verifiedAt && now.getTime() - verifiedAt.getTime() < EDU_VALID_MS;
}

export type EduStartResult = 'sent' | 'not_edu' | 'taken';

export async function startEduVerification(
  db: Db,
  mailer: Mailer,
  secret: string,
  userId: string,
  email: string,
  now: Date,
): Promise<EduStartResult> {
  if (!isEduTrEmail(email)) return 'not_edu';
  const normalized = normalizeEduEmail(email);
  if (await claimedByOther(db, userId, normalized)) {
    await writeAudit(db, secret, {
      actorId: userId,
      action: 'edu.taken',
      subjectType: 'user',
      subjectId: userId,
    });
    return 'taken';
  }
  const code = sixDigitCode();
  await db.insert(schema.eduVerifications).values({
    userId,
    email: normalized,
    codeHash: codeHash(secret, `edu:${userId}`, code),
    expiresAt: new Date(now.getTime() + EDU_CODE_TTL_MS),
  });
  // The code goes to the address as typed (lower case); the row keeps the normalised mailbox.
  await mailer.sendCode(email.trim().toLowerCase(), 'edu', code);
  await writeAudit(db, secret, {
    actorId: userId,
    action: 'edu.start',
    subjectType: 'user',
    subjectId: userId,
  });
  return 'sent';
}

export type EduConfirmResult = 'verified' | 'invalid' | 'taken';

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
  const normalized = normalizeEduEmail(row.email);
  // The check gives the common case its answer without a failed statement. The guarantee is the trigger: when
  // another account verifies the mailbox between the check and the update (another confirmation, an admin tool, a
  // script), the update fails with 23505 and the whole transaction, role and profile included, rolls back. Two
  // confirmations at once serialise on the edu_claims primary key, so no advisory lock is needed.
  let claimed: boolean;
  try {
    claimed = await db.transaction(async (tx) => {
      if (await claimedByOther(tx as unknown as Db, userId, normalized)) return true;
      await tx
        .update(schema.eduVerifications)
        .set({ verifiedAt: now })
        .where(eq(schema.eduVerifications.id, row.id));
      await tx
        .insert(schema.profiles)
        .values({ userId, eduVerified: true })
        .onConflictDoUpdate({ target: schema.profiles.userId, set: { eduVerified: true, updatedAt: now } });
      await tx
        .insert(schema.userRoles)
        .values({ userId, roleId: 'ogrenci_dogrulanmis' })
        .onConflictDoNothing();
      return false;
    });
  } catch (err) {
    if (!isEduClaimConflict(err)) throw err;
    claimed = true;
  }
  if (claimed) {
    await writeAudit(db, secret, {
      actorId: userId,
      action: 'edu.taken',
      subjectType: 'user',
      subjectId: userId,
    });
    return 'taken';
  }
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
