import type { AdminQueueDecisionInput, ReviewQueueName } from '@kazuist/contracts';
import { and, asc, desc, eq, ilike, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import { getMe, type Me } from './account.ts';
import { writeAudit } from './audit.ts';
import type { AuthContext } from './context.ts';
import { schema } from './db.ts';
import { decideTakedown } from './takedown.ts';

/**
 * Admin panel back end (plan 10.9). Authorisation lives in guard.ts (staff role, passkey session, TOTP
 * second step). Queue decisions with a side effect owned by kimlik (takedowns, kvkk-requests) are applied
 * here; other queues only record the decision, their module owners apply it from review_queue.
 */
export interface ReviewItem {
  id: string;
  queue: string;
  subjectId: string | null;
  payload: unknown;
  createdAt: string;
}

const PAGE = 50;

export async function listQueue(
  ctx: AuthContext,
  queue: ReviewQueueName,
  cursor: string | null,
): Promise<ReviewItem[]> {
  const offset = cursor && /^[0-9]{1,6}$/.test(cursor) ? Number(cursor) : 0;
  const rows = await ctx.db
    .select()
    .from(schema.reviewQueueItems)
    .where(and(eq(schema.reviewQueueItems.queue, queue), isNull(schema.reviewQueueItems.decision)))
    .orderBy(desc(schema.reviewQueueItems.priority), asc(schema.reviewQueueItems.createdAt))
    .limit(PAGE)
    .offset(offset);
  return rows.map((r) => ({
    id: r.id,
    queue: r.queue,
    subjectId: r.subjectId,
    payload: r.payload,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function decideQueueItem(
  ctx: AuthContext,
  actorId: string,
  queue: ReviewQueueName,
  itemId: string,
  input: z.infer<typeof AdminQueueDecisionInput>,
): Promise<'ok' | 'not_found'> {
  const [item] = await ctx.db
    .select()
    .from(schema.reviewQueueItems)
    .where(
      and(
        eq(schema.reviewQueueItems.id, itemId),
        eq(schema.reviewQueueItems.queue, queue),
        isNull(schema.reviewQueueItems.decision),
      ),
    );
  if (!item) return 'not_found';
  const now = ctx.now();
  let close = true;
  if (queue === 'takedowns') {
    if (!item.subjectId) return 'not_found';
    const r = await decideTakedown(ctx, actorId, item.subjectId, input.decision, input.note);
    if (r === 'not_found') return 'not_found';
    close = r === 'closed';
  } else if (queue === 'kvkk-requests') {
    if (!item.subjectId) return 'not_found';
    const status =
      input.decision === 'onay' ? 'kabul_edildi' : input.decision === 'ret' ? 'reddedildi' : 'inceleniyor';
    close = status !== 'inceleniyor';
    await ctx.db
      .update(schema.kvkkRequests)
      .set({
        status,
        updatedAt: now,
        ...(close
          ? {
              decidedAt: now,
              decidedBy: actorId,
              responseSummary: input.note ?? null,
              decisionReason: input.note ?? null,
            }
          : {}),
      })
      .where(eq(schema.kvkkRequests.id, item.subjectId));
  }
  if (close) {
    await ctx.db
      .update(schema.reviewQueueItems)
      .set({ decision: input.decision, decidedBy: actorId, decidedAt: now })
      .where(eq(schema.reviewQueueItems.id, item.id));
  }
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId,
    action: `admin.queue.${input.decision}`,
    subjectType: 'review_queue',
    subjectId: item.id,
    reason: input.note ?? null,
    diff: { queue, closed: close, patchPaths: input.patch?.changes?.map((c) => c.path) ?? [] },
  });
  return 'ok';
}

export async function listFlags(ctx: AuthContext) {
  const rows = await ctx.db.select().from(schema.featureFlags).orderBy(asc(schema.featureFlags.key));
  return rows.map((r) => ({ key: r.key, enabled: r.enabled, rolloutPercent: r.rolloutPercent }));
}

export async function setFlag(
  ctx: AuthContext,
  actorId: string,
  f: { key: string; enabled: boolean; rolloutPercent?: number },
) {
  const now = ctx.now();
  const set = {
    enabled: f.enabled,
    rolloutPercent: f.rolloutPercent ?? (f.enabled ? 100 : 0),
    updatedAt: now,
  };
  await ctx.db
    .insert(schema.featureFlags)
    .values({ key: f.key, ...set })
    .onConflictDoUpdate({ target: schema.featureFlags.key, set });
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId,
    action: 'admin.flag.set',
    subjectType: 'feature_flag',
    subjectId: f.key,
    diff: set,
  });
}

/** Search by e-mail prefix; the search itself is audited (personal data access). */
export async function searchUsers(
  ctx: AuthContext,
  actorId: string,
  q: string,
  cursor: string | null,
): Promise<Me[]> {
  const offset = cursor && /^[0-9]{1,6}$/.test(cursor) ? Number(cursor) : 0;
  const like = `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await ctx.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(ilike(schema.users.email, like), isNull(schema.users.deletedAt)))
    .orderBy(asc(schema.users.email))
    .limit(PAGE)
    .offset(offset);
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId,
    action: 'admin.users.search',
    subjectType: 'user',
    diff: { results: rows.length },
  });
  const out: Me[] = [];
  for (const r of rows) {
    const me = await getMe(ctx, r.id);
    if (me) out.push(me);
  }
  return out;
}
