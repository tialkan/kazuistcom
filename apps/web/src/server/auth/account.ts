import { asc, desc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { AccountPurgePayload, ConsentInput, MePatch } from '@kazuist/contracts';
import { runHook } from './auth.ts';
import { writeAudit } from './audit.ts';
import type { AuthContext } from './context.ts';
import { schema } from './db.ts';
import { subjectHash } from './hash.ts';
import { findProfession } from './professions.ts';
import type { Principal } from './guard.ts';
import { loadRoles } from './guard.ts';

export interface Me {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  eduVerified: boolean;
  targetProfession: string | null;
  avatar: string | null;
  tone: 'nazik' | 'dogrudan' | null;
  plan: 'ucretsiz' | 'byok' | 'ogrenci_plus' | 'akademisyen';
}

const plans = ['ucretsiz', 'byok', 'ogrenci_plus', 'akademisyen'] as const;

export async function getMe(ctx: AuthContext, userId: string): Promise<Me | null> {
  const [u] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u || u.deletedAt) return null;
  const [p] = await ctx.db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId));
  const tone = p?.tone === 'nazik' || p?.tone === 'dogrudan' ? p.tone : null;
  const plan = plans.find((x) => x === p?.plan) ?? 'ucretsiz';
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    roles: await loadRoles(ctx, userId),
    eduVerified: p?.eduVerified ?? false,
    targetProfession: p?.targetProfession ?? null,
    avatar: p?.avatar ?? null,
    tone,
    plan,
  };
}

async function upsertProfile(
  ctx: AuthContext,
  userId: string,
  set: Partial<typeof schema.profiles.$inferInsert>,
) {
  await ctx.db
    .insert(schema.profiles)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: schema.profiles.userId, set: { ...set, updatedAt: ctx.now() } });
}

export async function patchMe(ctx: AuthContext, p: Principal, body: z.infer<typeof MePatch>) {
  if (body.name !== undefined) {
    await ctx.db
      .update(schema.users)
      .set({ name: body.name, updatedAt: ctx.now() })
      .where(eq(schema.users.id, p.userId));
  }
  const set: Partial<typeof schema.profiles.$inferInsert> = {};
  if (body.avatar !== undefined) set.avatar = body.avatar;
  if (body.tone !== undefined) set.tone = body.tone;
  if (Object.keys(set).length) await upsertProfile(ctx, p.userId, set);
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId: p.userId,
    action: 'user.updated',
    subjectType: 'user',
    subjectId: p.userId,
    diff: { fields: Object.keys(body) },
  });
  return getMe(ctx, p.userId);
}

export async function setTargetProfession(
  ctx: AuthContext,
  p: Principal,
  professionId: string,
  avatar: string | undefined,
): Promise<Me | 'unknown_profession'> {
  const prof = findProfession(professionId);
  if (!prof || (avatar !== undefined && !prof.avatars.includes(avatar))) return 'unknown_profession';
  await upsertProfile(ctx, p.userId, { targetProfession: prof.id, ...(avatar ? { avatar } : {}) });
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId: p.userId,
    action: 'user.target_profession',
    subjectType: 'user',
    subjectId: p.userId,
  });
  return (await getMe(ctx, p.userId)) as Me;
}

/**
 * Account deletion (KVKK m.7, App Store 5.1.1(v)). Marks the user deleted, ends every session at once and
 * queues account.purge with run_after = now + grace period (ADR-0023, at most 30 days). Returns the job id.
 */
export async function deleteMe(ctx: AuthContext, p: Principal, requestRefund = true): Promise<string> {
  const now = ctx.now();
  await ctx.db
    .update(schema.users)
    .set({ deletedAt: now, deletionRequestRefund: requestRefund, updatedAt: now })
    .where(eq(schema.users.id, p.userId));
  await ctx.db.delete(schema.sessions).where(eq(schema.sessions.userId, p.userId));
  // Cancel subscriptions and queue a refund review for unused purchased credits (odeme O9). A failure is
  // logged and audited; deletion still proceeds and the admin sees billingHook=false.
  const billingHook = await runHook('deletion', () => ctx.hooks.onDeletion(p.userId, { requestRefund }));
  const payload: AccountPurgePayload = { userId: p.userId };
  const runAfter = new Date(now.getTime() + ctx.config.purgeGraceDays * 86_400_000);
  const [job] = await ctx.db
    .insert(schema.jobs)
    .values({ type: 'account.purge', payload, runAfter, dedupeKey: `account.purge:${p.userId}` })
    .returning({ id: schema.jobs.id });
  if (!job) throw new Error('purge job insert failed');
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId: p.userId,
    action: 'user.deletion_requested',
    subjectType: 'user',
    subjectId: p.userId,
    diff: { purgeJobId: job.id, runAfter: runAfter.toISOString(), billingHook, requestRefund },
  });
  return job.id;
}

export interface Consent {
  kind: z.infer<typeof ConsentInput>['kind'];
  version: string;
  granted: boolean;
  at: string;
}

export async function listConsents(ctx: AuthContext, userId: string): Promise<Consent[]> {
  const rows = await ctx.db
    .select()
    .from(schema.consents)
    .where(eq(schema.consents.userId, userId))
    .orderBy(asc(schema.consents.createdAt));
  return rows.map((r) => ({
    kind: r.kind,
    version: r.version,
    granted: r.granted,
    at: r.createdAt.toISOString(),
  }));
}

/** Append only, versioned: each grant or withdrawal is a new row with the text version shown. */
export async function recordConsent(
  ctx: AuthContext,
  p: Principal,
  input: z.infer<typeof ConsentInput>,
  context: { userAgent: string | null },
): Promise<Consent> {
  const [row] = await ctx.db
    .insert(schema.consents)
    .values({
      userId: p.userId,
      userHash: subjectHash(ctx.config.secret, p.userId),
      kind: input.kind,
      version: input.version,
      granted: input.granted,
      context: { channel: 'web', userAgent: context.userAgent?.slice(0, 200) ?? null },
    })
    .returning();
  if (!row) throw new Error('consent insert failed');
  return { kind: row.kind, version: row.version, granted: row.granted, at: row.createdAt.toISOString() };
}

/** KVKK m.11 data export: everything kimlik holds about the caller. Secrets and hashes are left out. */
export async function exportData(ctx: AuthContext, userId: string) {
  const db = ctx.db;
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      emailVerified: schema.users.emailVerified,
      name: schema.users.name,
      image: schema.users.image,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId));
  const accounts = await db
    .select({ providerId: schema.accounts.providerId, createdAt: schema.accounts.createdAt })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId));
  const passkeys = await db
    .select({
      name: schema.passkeys.name,
      deviceType: schema.passkeys.deviceType,
      createdAt: schema.passkeys.createdAt,
    })
    .from(schema.passkeys)
    .where(eq(schema.passkeys.userId, userId));
  const sessions = await db
    .select({
      createdAt: schema.sessions.createdAt,
      expiresAt: schema.sessions.expiresAt,
      ipAddress: schema.sessions.ipAddress,
      userAgent: schema.sessions.userAgent,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId));
  const edu = await db
    .select({ email: schema.eduVerifications.email, verifiedAt: schema.eduVerifications.verifiedAt })
    .from(schema.eduVerifications)
    .where(eq(schema.eduVerifications.userId, userId));
  const [notificationPrefs] = await db
    .select()
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, userId));
  const activity = await db
    .select({
      action: schema.auditLog.action,
      subjectType: schema.auditLog.subjectType,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.actorId, userId))
    .orderBy(desc(schema.auditLog.createdAt));
  return {
    exportedAt: ctx.now().toISOString(),
    user: user ?? null,
    profile: profile ?? null,
    roles: await loadRoles(ctx, userId),
    accounts,
    passkeys,
    sessions,
    eduVerifications: edu,
    consents: await listConsents(ctx, userId),
    notificationPrefs: notificationPrefs ?? null,
    activity,
  };
}

const csvCell = (v: unknown): string => {
  const s =
    v instanceof Date
      ? v.toISOString()
      : v === null || v === undefined
        ? ''
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v);
  // Neutralise spreadsheet formulas (CSV injection) and quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Long CSV: section, row index, field, value. One file keeps every section readable. */
export function toCsv(data: Record<string, unknown>): string {
  const lines = ['section,row,field,value'];
  for (const [section, value] of Object.entries(data)) {
    const rows = Array.isArray(value) ? value : [value];
    rows.forEach((row, i) => {
      if (row !== null && typeof row === 'object' && !(row instanceof Date)) {
        for (const [k, v] of Object.entries(row)) lines.push([section, i, k, v].map(csvCell).join(','));
      } else {
        lines.push([section, i, '', row].map(csvCell).join(','));
      }
    });
  }
  return lines.join('\r\n') + '\r\n';
}
