import type { AdminQueueDecisionInput, ReviewQueueName } from '@kazuist/contracts';
import { and, asc, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { getMe, type Me } from './account.ts';
import { writeAudit } from './audit.ts';
import { applyCitationDecision } from './citation-queue.ts';
import type { AuthContext } from './context.ts';
import { schema } from './db.ts';
import { decideRelease, decideTakedown, RELEASE_SUBJECT } from './takedown.ts';

/**
 * Admin panel back end (plan 10.9). Authorisation lives in guard.ts (staff role, passkey session, TOTP
 * second step). Queue decisions with a side effect are applied here: takedowns (with the release step after
 * ek_maskeleme) and kvkk-requests (kimlik) and
 * citations (the edge's confirmed or rejected flag, citation-queue.ts); other queues only record the decision,
 * their module owners apply it from review_queue.
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
): Promise<'ok' | 'not_found' | 'unsupported' | 'not_ready'> {
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
  if (queue === 'citations') return decideCitation(ctx, actorId, item, input, now);
  if (queue === 'anonymization') return decideAnonymization(ctx, actorId, item, input, now);
  if (queue === 'takedowns' && item.subjectType === RELEASE_SUBJECT) {
    // Showing a record again after ek_maskeleme; the step closes its own item and writes its own audit row.
    const r = await decideRelease(ctx, actorId, item, input.decision, input.note);
    return r === 'not_found' || r === 'not_ready' ? r : 'ok';
  }
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

/**
 * Citations: the item is closed and the edge flag written in one transaction; a second decision on the same item
 * (two editors at once) finds it closed and gets not_found. duzelt has no defined edit for an edge and is refused.
 */
async function decideCitation(
  ctx: AuthContext,
  actorId: string,
  item: typeof schema.reviewQueueItems.$inferSelect,
  input: z.infer<typeof AdminQueueDecisionInput>,
  now: Date,
): Promise<'ok' | 'not_found' | 'unsupported'> {
  const decision = input.decision;
  if (decision === 'duzelt') return 'unsupported';
  const r = await ctx.db.transaction(async (tx) => {
    const closed = await tx
      .update(schema.reviewQueueItems)
      .set({ decision, decidedBy: actorId, decidedAt: now })
      .where(and(eq(schema.reviewQueueItems.id, item.id), isNull(schema.reviewQueueItems.decision)))
      .returning({ id: schema.reviewQueueItems.id });
    if (!closed.length) return null;
    return applyCitationDecision(tx, item, decision);
  });
  if (!r) return 'not_found';
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId,
    action: `admin.queue.${decision}`,
    subjectType: 'review_queue',
    subjectId: item.id,
    reason: input.note ?? null,
    diff: { queue: 'citations', closed: true, kind: r.kind, edgeId: item.subjectId, applied: r.applied },
  });
  return 'ok';
}

/**
 * Anonymization (plan 6.4/6, FR-79): the item is closed and, for an approval of a record, anon.run is queued in the
 * same transaction (dedupe key anon:<recordId>, the ingest key; an anon.run already queued or running for the
 * record absorbs the insert). anon.run applies the latest approved item of the record's anonymization version and
 * publishes masked_text (docs/istekler/anonimlestirme-onay-ve-acik-kaynak.md, madde 3). ret and duzelt only record
 * the decision: a later ret or duzelt overrides the approval and the record stays unpublished.
 */
async function decideAnonymization(
  ctx: AuthContext,
  actorId: string,
  item: typeof schema.reviewQueueItems.$inferSelect,
  input: z.infer<typeof AdminQueueDecisionInput>,
  now: Date,
): Promise<'ok' | 'not_found'> {
  const decision = input.decision;
  const recordId = item.subjectType === 'record' ? item.subjectId : null;
  const r = await ctx.db.transaction(async (tx) => {
    const closed = await tx
      .update(schema.reviewQueueItems)
      .set({ decision, decidedBy: actorId, decidedAt: now })
      .where(and(eq(schema.reviewQueueItems.id, item.id), isNull(schema.reviewQueueItems.decision)))
      .returning({ id: schema.reviewQueueItems.id });
    if (!closed.length) return null;
    if (decision !== 'onay' || !recordId) return { jobQueued: false };
    const inserted = await tx.execute(sql`
      INSERT INTO jobs (type, payload, dedupe_key)
      VALUES ('anon.run'::job_type, jsonb_build_object('recordId', ${recordId}::text), 'anon:' || ${recordId}::text)
      ON CONFLICT (type, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running') DO NOTHING
      RETURNING id`);
    return { jobQueued: rowCount(inserted) > 0 };
  });
  if (!r) return 'not_found';
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId,
    action: `admin.queue.${decision}`,
    subjectType: 'review_queue',
    subjectId: item.id,
    reason: input.note ?? null,
    diff: {
      queue: 'anonymization',
      closed: true,
      recordId,
      jobQueued: r.jobQueued,
      patchPaths: input.patch?.changes?.map((c) => c.path) ?? [],
    },
  });
  return 'ok';
}

/** Rows returned by tx.execute: node-postgres and PGlite both expose them as rows. */
function rowCount(result: unknown): number {
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows.length : 0;
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
