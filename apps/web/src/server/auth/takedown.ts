import { AnonRunPayload, takedownDeadlines, type TakedownRequestInput } from '@kazuist/contracts';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { writeAudit } from './audit.ts';
import type { AuthContext } from './context.ts';
import { schema } from './db.ts';

/**
 * Takedown requests (FR-79, FR-108, ADR-0023). Intake is public; the temporary hiding decision is due
 * within 72 hours (hide_due_at) and personal data requests are concluded within 30 days (due_at).
 */
export async function createTakedownRequest(
  ctx: AuthContext,
  input: z.infer<typeof TakedownRequestInput>,
): Promise<string | 'unknown_target'> {
  const now = ctx.now();
  if (!(await targetExists(ctx, input.targetType, input.targetId))) return 'unknown_target';
  const { hideDueAt, dueAt } = takedownDeadlines(input.kind, now);
  const [row] = await ctx.db
    .insert(schema.takedownRequests)
    .values({
      kind: input.kind,
      targetType: input.targetType,
      targetId: input.targetId,
      recordId: input.targetType === 'record' ? input.targetId : null,
      requesterName: input.requesterName ?? null,
      reason: input.reason,
      rightsInfo: input.rightsInfo ?? null,
      contactEmail: input.contactEmail.trim().toLowerCase(),
      hideDueAt,
      dueAt,
      createdAt: now,
    })
    .returning({ id: schema.takedownRequests.id });
  if (!row) throw new Error('takedown insert failed');
  await ctx.db.insert(schema.reviewQueueItems).values({
    queue: 'takedowns',
    subjectType: 'takedown_request',
    subjectId: row.id,
    priority: 10,
  });
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId: null,
    action: 'takedown.request',
    subjectType: 'takedown_request',
    subjectId: row.id,
    diff: { kind: input.kind, targetType: input.targetType },
  });
  return row.id;
}

async function targetExists(ctx: AuthContext, type: string, id: string): Promise<boolean> {
  const table =
    type === 'record' ? schema.records : type === 'kampus_post' ? schema.kampusPosts : schema.kampusFiles;
  const rows = await ctx.db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  return rows.length > 0;
}

/** Hide the target; an earlier hiding time is kept (coalesce). */
async function hide(ctx: AuthContext, type: string, id: string, at: Date) {
  if (type === 'record')
    await ctx.db
      .update(schema.records)
      .set({ hiddenAt: sql`coalesce(${schema.records.hiddenAt}, ${at})` })
      .where(eq(schema.records.id, id));
  else if (type === 'kampus_post')
    await ctx.db
      .update(schema.kampusPosts)
      .set({ hiddenAt: sql`coalesce(${schema.kampusPosts.hiddenAt}, ${at})` })
      .where(eq(schema.kampusPosts.id, id));
  else
    await ctx.db
      .update(schema.kampusFiles)
      .set({ hiddenAt: sql`coalesce(${schema.kampusFiles.hiddenAt}, ${at})` })
      .where(eq(schema.kampusFiles.id, id));
}

async function unhide(ctx: AuthContext, type: string, id: string) {
  if (type === 'record')
    await ctx.db.update(schema.records).set({ hiddenAt: null }).where(eq(schema.records.id, id));
  else if (type === 'kampus_post')
    await ctx.db.update(schema.kampusPosts).set({ hiddenAt: null }).where(eq(schema.kampusPosts.id, id));
  else await ctx.db.update(schema.kampusFiles).set({ hiddenAt: null }).where(eq(schema.kampusFiles.id, id));
}

/**
 * True when another request on the same target still requires the target hidden: temporarily hidden and not
 * yet decided, or concluded with permanent removal or additional masking.
 */
async function otherRequestKeepsHidden(
  ctx: AuthContext,
  t: { id: string; targetType: string; targetId: string },
): Promise<boolean> {
  const T = schema.takedownRequests;
  const rows = await ctx.db
    .select({ id: T.id })
    .from(T)
    .where(
      and(
        eq(T.targetType, t.targetType as typeof T.$inferSelect.targetType),
        eq(T.targetId, t.targetId),
        ne(T.id, t.id),
        or(eq(T.status, 'gecici_gizlendi'), inArray(T.decision, ['kalici_kaldirma', 'ek_maskeleme'])),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Queue the anonymiser again for a record (dedupe key anon:<id>, as the ingest pipeline uses). */
async function enqueueRemask(ctx: AuthContext, recordId: string): Promise<void> {
  const payload = AnonRunPayload.parse({ recordId });
  await ctx.db
    .insert(schema.jobs)
    .values({ type: 'anon.run', payload, dedupeKey: `anon:${recordId}` })
    .onConflictDoNothing();
}

export type TakedownAction = 'onay' | 'ret' | 'duzelt';

/**
 * Admin decision on a takedown (kaldirma.md section 3/4):
 * - onay while bekliyor: temporary hiding (gecici_gizlendi); the queue item stays open.
 * - onay while gecici_gizlendi: kalici_kaldirma (target stays hidden), concluded.
 * - duzelt: ek_maskeleme, concluded. The target stays hidden (it is hidden now if it was not) and, for a
 *   record, anon.run is queued to mask it again; showing it again is a separate editorial step.
 * - ret: ret, concluded. The target is shown again only when this request hid it and no other request on
 *   the same target keeps it hidden (gecici_gizlendi, kalici_kaldirma or ek_maskeleme).
 * Returns whether the review item is closed.
 */
export async function decideTakedown(
  ctx: AuthContext,
  actorId: string,
  takedownId: string,
  action: TakedownAction,
  note: string | undefined,
): Promise<'closed' | 'open' | 'not_found'> {
  const [t] = await ctx.db
    .select()
    .from(schema.takedownRequests)
    .where(eq(schema.takedownRequests.id, takedownId));
  if (!t || t.status === 'sonuclandi') return 'not_found';
  const now = ctx.now();
  let result: 'closed' | 'open';
  if (action === 'onay' && t.status === 'bekliyor') {
    await hide(ctx, t.targetType, t.targetId, now);
    await ctx.db
      .update(schema.takedownRequests)
      .set({ status: 'gecici_gizlendi', hiddenAt: now, updatedAt: now })
      .where(eq(schema.takedownRequests.id, t.id));
    result = 'open';
  } else {
    const decision = action === 'onay' ? 'kalici_kaldirma' : action === 'duzelt' ? 'ek_maskeleme' : 'ret';
    if (decision === 'ret') {
      if (t.hiddenAt && !(await otherRequestKeepsHidden(ctx, t))) await unhide(ctx, t.targetType, t.targetId);
    } else {
      await hide(ctx, t.targetType, t.targetId, now);
      if (decision === 'ek_maskeleme' && t.targetType === 'record') await enqueueRemask(ctx, t.targetId);
    }
    await ctx.db
      .update(schema.takedownRequests)
      .set({
        status: 'sonuclandi',
        decision,
        decisionReason: note ?? null,
        decidedBy: actorId,
        decidedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.takedownRequests.id, t.id));
    result = 'closed';
  }
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId,
    action: `takedown.${action}`,
    subjectType: 'takedown_request',
    subjectId: t.id,
    reason: note ?? null,
    diff: { from: t.status, result },
  });
  return result;
}
