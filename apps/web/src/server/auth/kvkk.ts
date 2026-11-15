import { kvkkDueAt, type KvkkGuestRequestInput, type KvkkRequestInput } from '@kazuist/contracts';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { z } from 'zod';
import { writeAudit } from './audit.ts';
import type { AuthContext } from './context.ts';
import { schema } from './db.ts';
import type { Principal } from './guard.ts';
import { codeHash, safeEqualHex, sixDigitCode, subjectHash } from './hash.ts';
import { MailUnavailableError } from './mailer.ts';
import { encryptPii, isValidTckn } from './pii.ts';

/** KVKK m.11 applications (plan 10.10, ADR-0023) in kvkk_requests, queued for the admin panel. */
export interface KvkkReceipt {
  id: string;
  status: (typeof schema.kvkkRequests.$inferSelect)['status'];
  receivedAt: string;
  dueAt: string;
}

const GUEST_CODE_TTL_MS = 30 * 60 * 1000;
export const GUEST_MAX_ATTEMPTS = 5;
const guestCodeId = (id: string) => `kz:kvkk-guest:${id}`;

const receipt = (r: typeof schema.kvkkRequests.$inferSelect): KvkkReceipt => ({
  id: r.id,
  status: r.status,
  receivedAt: r.receivedAt.toISOString(),
  dueAt: r.dueAt.toISOString(),
});

async function enqueueReview(ctx: AuthContext, id: string) {
  await ctx.db
    .insert(schema.reviewQueueItems)
    .values({ queue: 'kvkk-requests', subjectType: 'kvkk_request', subjectId: id });
}

export type KvkkCreateError = 'address_required';

export async function createKvkkRequest(
  ctx: AuthContext,
  p: Principal,
  input: z.infer<typeof KvkkRequestInput>,
): Promise<KvkkReceipt | KvkkCreateError> {
  if (input.replyChannel === 'posta' && !input.address) return 'address_required';
  const now = ctx.now();
  const [row] = await ctx.db
    .insert(schema.kvkkRequests)
    .values({
      userId: p.userId,
      requesterHash: subjectHash(ctx.config.secret, p.userId),
      contactEmail: p.email,
      address: input.address ?? null,
      relation: 'kullanici',
      kind: input.kind,
      detail: input.detail,
      replyChannel: input.replyChannel,
      status: 'alindi',
      receivedAt: now,
      dueAt: kvkkDueAt(now),
      verifiedAt: now,
    })
    .returning();
  if (!row) throw new Error('kvkk insert failed');
  await enqueueReview(ctx, row.id);
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId: p.userId,
    action: 'kvkk.request',
    subjectType: 'kvkk_request',
    subjectId: row.id,
    diff: { kind: input.kind },
  });
  return receipt(row);
}

export type GuestError = 'invalid_identity' | 'unavailable' | 'mail_unavailable';

/**
 * Application without an account. Recorded at arrival (receivedAt counts from now, Teblig m.5), then
 * confirmed with a code sent to contactEmail. The identity number is encrypted; nothing personal is logged.
 */
export async function createGuestKvkkRequest(
  ctx: AuthContext,
  input: z.infer<typeof KvkkGuestRequestInput>,
): Promise<KvkkReceipt | GuestError> {
  if (input.nationality === 'TR' && !isValidTckn(input.identityNumber)) return 'invalid_identity';
  if (!ctx.config.piiKey) return 'unavailable';
  const now = ctx.now();
  const email = input.contactEmail.trim().toLowerCase();
  const [row] = await ctx.db
    .insert(schema.kvkkRequests)
    .values({
      userId: null,
      requesterHash: subjectHash(ctx.config.secret, `email:${email}`),
      requesterName: input.requesterName,
      nationality: input.nationality,
      identityEnc: encryptPii(ctx.config.piiKey, input.identityNumber),
      address: input.address,
      contactEmail: email,
      phone: input.phone ?? null,
      relation: input.relation,
      kind: input.kind,
      detail: input.detail,
      replyChannel: input.replyChannel,
      status: 'dogrulama_bekliyor',
      receivedAt: now,
      dueAt: kvkkDueAt(now),
    })
    .returning();
  if (!row) throw new Error('kvkk insert failed');
  const code = sixDigitCode();
  await ctx.db.insert(schema.verifications).values({
    identifier: guestCodeId(row.id),
    value: codeHash(ctx.config.secret, guestCodeId(row.id), code),
    expiresAt: new Date(now.getTime() + GUEST_CODE_TTL_MS),
  });
  try {
    await ctx.mailer.sendCode(email, 'kvkk-guest', code);
  } catch (err) {
    // The application stays recorded as dogrulama_bekliyor; the caller gets 503 and may send it again.
    if (err instanceof MailUnavailableError) return 'mail_unavailable';
    throw err;
  }
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId: null,
    action: 'kvkk.guest_request',
    subjectType: 'kvkk_request',
    subjectId: row.id,
    diff: { kind: input.kind },
  });
  return receipt(row);
}

export async function verifyGuestKvkkRequest(
  ctx: AuthContext,
  id: string,
  code: string,
): Promise<KvkkReceipt | 'not_found' | 'invalid'> {
  const [req] = await ctx.db.select().from(schema.kvkkRequests).where(eq(schema.kvkkRequests.id, id));
  if (!req || req.userId) return 'not_found';
  if (req.status !== 'dogrulama_bekliyor') return receipt(req);
  const now = ctx.now();
  const [row] = await ctx.db
    .select()
    .from(schema.verifications)
    .where(and(eq(schema.verifications.identifier, guestCodeId(id)), gt(schema.verifications.expiresAt, now)))
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);
  if (!row || !safeEqualHex(row.value, codeHash(ctx.config.secret, guestCodeId(id), code))) return 'invalid';
  await ctx.db.delete(schema.verifications).where(eq(schema.verifications.id, row.id));
  const [upd] = await ctx.db
    .update(schema.kvkkRequests)
    .set({ status: 'alindi', verifiedAt: now, updatedAt: now })
    .where(eq(schema.kvkkRequests.id, id))
    .returning();
  if (!upd) return 'not_found';
  await enqueueReview(ctx, id);
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId: null,
    action: 'kvkk.guest_verified',
    subjectType: 'kvkk_request',
    subjectId: id,
  });
  return receipt(upd);
}
