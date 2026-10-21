import { takedownDeadlines, type TakedownRequestInput } from '@kazuist/contracts';
import { eq } from 'drizzle-orm';
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

async function setHidden(ctx: AuthContext, type: string, id: string, at: Date | null) {
  if (type === 'record')
    await ctx.db.update(schema.records).set({ hiddenAt: at }).where(eq(schema.records.id, id));
  else if (type === 'kampus_post')
    await ctx.db.update(schema.kampusPosts).set({ hiddenAt: at }).where(eq(schema.kampusPosts.id, id));
  else await ctx.db.update(schema.kampusFiles).set({ hiddenAt: at }).where(eq(schema.kampusFiles.id, id));
}

export type TakedownAction = 'onay' | 'ret' | 'duzelt';

/**
 * Admin decision on a takedown (kaldirma.md section 3/4):
 * - onay while bekliyor: temporary hiding (gecici_gizlendi); the queue item stays open.
 * - onay while gecici_gizlendi: kalici_kaldirma (target stays hidden), concluded.
 * - duzelt: ek_maskeleme (masking is applied by the anonymiser; the target is shown again), concluded.
 * - ret: ret, the target is shown again, concluded.
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
    await setHidden(ctx, t.targetType, t.targetId, now);
    await ctx.db
      .update(schema.takedownRequests)
      .set({ status: 'gecici_gizlendi', hiddenAt: now, updatedAt: now })
      .where(eq(schema.takedownRequests.id, t.id));
    result = 'open';
  } else {
    const decision = action === 'onay' ? 'kalici_kaldirma' : action === 'duzelt' ? 'ek_maskeleme' : 'ret';
    if (decision !== 'kalici_kaldirma') await setHidden(ctx, t.targetType, t.targetId, null);
    else if (!t.hiddenAt) await setHidden(ctx, t.targetType, t.targetId, now);
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
