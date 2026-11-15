import { AnonRunPayload, takedownDeadlines, type TakedownRequestInput } from '@kazuist/contracts';
import { and, desc, eq, isNull, ne, notExists, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { writeAudit } from './audit.ts';
import type { AuthContext } from './context.ts';
import { schema, type Db } from './db.ts';

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

/**
 * Only records can be taken down. Kampus is out of scope (ADR-0031): the contract still lists kampus_post and
 * kampus_file, so such a request is refused here as an unknown target and nothing reads the kampus tables.
 */
async function targetExists(ctx: AuthContext, type: string, id: string): Promise<boolean> {
  if (type !== 'record') return false;
  const rows = await ctx.db
    .select({ id: schema.records.id })
    .from(schema.records)
    .where(eq(schema.records.id, id))
    .limit(1);
  return rows.length > 0;
}

/** Hide the record; an earlier hiding time is kept (coalesce). Other target types are never stored. */
async function hide(ctx: AuthContext, type: string, id: string, at: Date) {
  if (type !== 'record') return;
  await ctx.db
    .update(schema.records)
    .set({ hiddenAt: sql`coalesce(${schema.records.hiddenAt}, ${at})` })
    .where(eq(schema.records.id, id));
}

async function unhide(ctx: AuthContext, type: string, id: string) {
  if (type !== 'record') return;
  await ctx.db.update(schema.records).set({ hiddenAt: null }).where(eq(schema.records.id, id));
}

/** review_queue subject of the editor step that shows a record again after ek_maskeleme (queue takedowns). */
export const RELEASE_SUBJECT = 'takedown_release';

/**
 * True when another request on the same target still requires the target hidden: temporarily hidden and not
 * yet decided, concluded with permanent removal, or concluded with additional masking whose release step
 * (RELEASE_SUBJECT item) an editor has not approved.
 */
async function otherRequestKeepsHidden(
  db: Db,
  t: { id: string; targetType: string; targetId: string },
): Promise<boolean> {
  const T = schema.takedownRequests;
  const R = schema.reviewQueueItems;
  const released = db
    .select({ one: sql`1` })
    .from(R)
    .where(
      and(
        eq(R.queue, 'takedowns'),
        eq(R.subjectType, RELEASE_SUBJECT),
        eq(R.subjectId, T.id),
        eq(R.decision, 'onay'),
      ),
    );
  const rows = await db
    .select({ id: T.id })
    .from(T)
    .where(
      and(
        eq(T.targetType, t.targetType as typeof T.$inferSelect.targetType),
        eq(T.targetId, t.targetId),
        ne(T.id, t.id),
        or(
          eq(T.status, 'gecici_gizlendi'),
          eq(T.decision, 'kalici_kaldirma'),
          and(eq(T.decision, 'ek_maskeleme'), notExists(released)),
        ),
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
 *   record, anon.run is queued to mask it again and a release item opens in the takedowns queue; showing the
 *   record again is that separate editorial step (decideRelease).
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
      if (t.hiddenAt && !(await otherRequestKeepsHidden(ctx.db, t)))
        await unhide(ctx, t.targetType, t.targetId);
    } else {
      await hide(ctx, t.targetType, t.targetId, now);
      if (decision === 'ek_maskeleme' && t.targetType === 'record') {
        await enqueueRemask(ctx, t.targetId);
        await ctx.db.insert(schema.reviewQueueItems).values({
          queue: 'takedowns',
          subjectType: RELEASE_SUBJECT,
          subjectId: t.id,
          payload: { action: 'release_after_remask', takedownId: t.id, recordId: t.targetId },
          priority: 5,
        });
      }
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

export type ReleaseResult = 'shown' | 'kept_hidden' | 'closed' | 'open' | 'not_ready' | 'not_found';

/**
 * The anonymiser has finished the re-mask queued by ek_maskeleme: the newest anon.run job of the record (dedupe
 * key anon:<id>, the one queued or joined at the decision) is done, its result is publishable (masked_text written,
 * anonymized) and no anonymization review item of the record is open. A run held for review leaves masked_text
 * empty; the record is released only after the anonymiser publishes the approved masks.
 */
async function remaskFinished(db: Db, recordId: string): Promise<boolean> {
  const J = schema.jobs;
  const [job] = await db
    .select({ status: J.status })
    .from(J)
    .where(and(eq(J.type, 'anon.run'), eq(J.dedupeKey, `anon:${recordId}`)))
    .orderBy(desc(J.createdAt))
    .limit(1);
  if (job?.status !== 'done') return false;
  const [rec] = await db
    .select({
      anonymized: schema.records.anonymized,
      masked: sql<boolean>`${schema.records.maskedText} is not null`,
    })
    .from(schema.records)
    .where(eq(schema.records.id, recordId));
  if (!rec?.anonymized || !rec.masked) return false;
  const R = schema.reviewQueueItems;
  const open = await db
    .select({ id: R.id })
    .from(R)
    .where(
      and(
        eq(R.queue, 'anonymization'),
        eq(R.subjectType, 'record'),
        eq(R.subjectId, recordId),
        isNull(R.decision),
      ),
    )
    .limit(1);
  return open.length === 0;
}

/**
 * Editor decision on a release item (RELEASE_SUBJECT), opened by ek_maskeleme on a record:
 * - onay: only after remaskFinished (else not_ready, the item stays open). The item closes; the record is shown
 *   again unless another request on it keeps it hidden (then it is shown when that one is released or rejected).
 * - ret: the item closes and the record stays hidden for good (the request keeps it hidden).
 * - duzelt: anon.run is queued again (the same dedupe key); the item stays open.
 * The item is closed and the record shown in one transaction under a lock on the target, so two editors releasing
 * two requests on one record at once cannot both see the other as pending and leave it hidden.
 */
export async function decideRelease(
  ctx: AuthContext,
  actorId: string,
  item: typeof schema.reviewQueueItems.$inferSelect,
  action: TakedownAction,
  note: string | undefined,
): Promise<ReleaseResult> {
  if (!item.subjectId) return 'not_found';
  const [t] = await ctx.db
    .select()
    .from(schema.takedownRequests)
    .where(eq(schema.takedownRequests.id, item.subjectId));
  if (!t || t.decision !== 'ek_maskeleme' || t.targetType !== 'record') return 'not_found';
  const now = ctx.now();
  let result: ReleaseResult;
  if (action === 'duzelt') {
    await enqueueRemask(ctx, t.targetId);
    result = 'open';
  } else {
    result = await ctx.db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`takedown:${t.targetId}`}, 0))`);
      if (action === 'onay' && !(await remaskFinished(tx, t.targetId))) return 'not_ready';
      const closed = await tx
        .update(schema.reviewQueueItems)
        .set({ decision: action, decidedBy: actorId, decidedAt: now })
        .where(and(eq(schema.reviewQueueItems.id, item.id), isNull(schema.reviewQueueItems.decision)))
        .returning({ id: schema.reviewQueueItems.id });
      if (!closed.length) return 'not_found';
      if (action === 'ret') return 'closed';
      if (await otherRequestKeepsHidden(tx, t)) return 'kept_hidden';
      await tx.update(schema.records).set({ hiddenAt: null }).where(eq(schema.records.id, t.targetId));
      return 'shown';
    });
  }
  if (result === 'not_found' || result === 'not_ready') return result;
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId,
    action: `takedown.release.${action}`,
    subjectType: 'takedown_request',
    subjectId: t.id,
    reason: note ?? null,
    diff: { reviewItem: item.id, result },
  });
  return result;
}
