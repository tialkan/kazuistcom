import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthContext } from './context.ts';
import { schema, type Db } from './db.ts';
import { RELEASE_SUBJECT } from './takedown.ts';

/**
 * Read models of the staff screens /hesap/yonetim/kaldirma and /hesap/yonetim/anonimlestirme. Decisions go
 * through POST /api/v1/admin/queues/{queue}/{id}/decision (admin.ts), which checks the gate again.
 */

const PAGE = 50;
const HOUR_MS = 3_600_000;

interface RecordRef {
  id: string;
  title: string;
  court: string | null;
  esasNo: string | null;
  kararNo: string | null;
}

async function recordRefs(db: Db, ids: string[]): Promise<Map<string, RecordRef>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({
      id: schema.records.id,
      title: schema.records.title,
      court: schema.records.court,
      esasNo: schema.records.esasNo,
      kararNo: schema.records.kararNo,
    })
    .from(schema.records)
    .where(inArray(schema.records.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Where a request stands against the 72 hour hiding deadline (FR-108). */
export interface HideDeadline {
  dueAt: string;
  /** Whole hours until the deadline; negative once it has passed. */
  hoursLeft: number;
  state: 'ok' | 'soon' | 'overdue';
}

/** Less than this many hours left is shown as urgent. */
export const HIDE_SOON_HOURS = 12;

export function hideDeadline(dueAt: Date, now: Date): HideDeadline {
  const ms = dueAt.getTime() - now.getTime();
  const hoursLeft = ms >= 0 ? Math.floor(ms / HOUR_MS) : -Math.ceil(-ms / HOUR_MS);
  return {
    dueAt: dueAt.toISOString(),
    hoursLeft,
    state: ms <= 0 ? 'overdue' : hoursLeft < HIDE_SOON_HOURS ? 'soon' : 'ok',
  };
}

export interface TakedownQueueItem {
  id: string;
  /** decision: a request awaiting hiding or a final decision; release: showing a record again after ek_maskeleme. */
  step: 'decision' | 'release';
  takedownId: string;
  kind: string;
  status: string;
  decision: string | null;
  targetType: string;
  record: RecordRef | null;
  reason: string;
  rightsInfo: string | null;
  createdAt: string;
  /** Only while the request is still bekliyor: the hiding decision is what the 72 hours apply to. */
  hide: HideDeadline | null;
  /** Thirty day answer of a personal data request. */
  answerDueAt: string | null;
}

/**
 * Open takedowns items, overdue hiding decisions first, then the rest by priority and age. Requester contact
 * details are left out: the decision does not need them.
 */
export async function listTakedownQueue(
  ctx: AuthContext,
  offset = 0,
): Promise<{ items: TakedownQueueItem[]; next: number | null }> {
  const R = schema.reviewQueueItems;
  const T = schema.takedownRequests;
  const rows = await ctx.db
    .select({ item: R, t: T })
    .from(R)
    .innerJoin(T, eq(T.id, R.subjectId))
    .where(and(eq(R.queue, 'takedowns'), isNull(R.decision)))
    .orderBy(
      desc(
        sql`(${R.subjectType} <> ${RELEASE_SUBJECT} and ${T.status} = 'bekliyor' and ${T.hideDueAt} <= ${ctx.now()})`,
      ),
      desc(R.priority),
      asc(R.createdAt),
    )
    .limit(PAGE + 1)
    .offset(offset);
  const page = rows.slice(0, PAGE);
  const refs = await recordRefs(ctx.db, [
    ...new Set(page.filter((r) => r.t.targetType === 'record').map((r) => r.t.targetId)),
  ]);
  const now = ctx.now();
  return {
    items: page.map(({ item, t }) => ({
      id: item.id,
      step: item.subjectType === RELEASE_SUBJECT ? 'release' : 'decision',
      takedownId: t.id,
      kind: t.kind,
      status: t.status,
      decision: t.decision,
      targetType: t.targetType,
      record: t.targetType === 'record' ? (refs.get(t.targetId) ?? null) : null,
      reason: t.reason,
      rightsInfo: t.rightsInfo,
      createdAt: item.createdAt.toISOString(),
      hide:
        item.subjectType !== RELEASE_SUBJECT && t.status === 'bekliyor'
          ? hideDeadline(t.hideDueAt, now)
          : null,
      answerDueAt: t.dueAt ? t.dueAt.toISOString() : null,
    })),
    next: rows.length > PAGE ? offset + PAGE : null,
  };
}

/** Payload of an anonymization item (services/worker-py/anonymizer/pipeline.py review_queue_row), read loosely. */
const AnonPayload = z.object({
  policyVersion: z.string().nullish(),
  anonymizationVersion: z.string().nullish(),
  childStrict: z.boolean().nullish(),
  blocked: z.string().nullish(),
  items: z
    .array(
      z.object({
        charStart: z.number().int().nonnegative(),
        charEnd: z.number().int().nonnegative(),
        entity: z.string(),
        mask: z.string(),
        detector: z.string().nullish(),
        score: z.number().nullish(),
      }),
    )
    .default([]),
});

export interface AnonSpan {
  entity: string;
  mask: string;
  detector: string | null;
  score: number | null;
  /** Original text around the span, from records.text; staff only, never logged. */
  before: string;
  span: string;
  after: string;
}

export interface AnonQueueItem {
  id: string;
  record: RecordRef | null;
  createdAt: string;
  anonymizationVersion: string | null;
  childStrict: boolean;
  blocked: string | null;
  spans: AnonSpan[];
  /** Review items beyond the ones shown. */
  more: number;
}

/** Spans shown per item and characters of context on each side. */
export const ANON_SPANS_SHOWN = 20;
const CONTEXT = 40;

/**
 * Open anonymization items with a short window of the original text around each span, so the editor can judge
 * the proposed mask. Offsets are Python code point offsets; the text is sliced by code points to match.
 */
export async function listAnonymizationQueue(
  ctx: AuthContext,
  offset = 0,
): Promise<{ items: AnonQueueItem[]; next: number | null }> {
  const R = schema.reviewQueueItems;
  const rows = await ctx.db
    .select()
    .from(R)
    .where(and(eq(R.queue, 'anonymization'), isNull(R.decision)))
    .orderBy(desc(R.priority), asc(R.createdAt))
    .limit(PAGE + 1)
    .offset(offset);
  const page = rows.slice(0, PAGE);
  const ids = [
    ...new Set(page.flatMap((r) => (r.subjectType === 'record' && r.subjectId ? [r.subjectId] : []))),
  ];
  const refs = await recordRefs(ctx.db, ids);
  const texts = new Map<string, string[]>();
  if (ids.length) {
    const rs = await ctx.db
      .select({ id: schema.records.id, text: schema.records.text })
      .from(schema.records)
      .where(inArray(schema.records.id, ids));
    for (const r of rs) texts.set(r.id, Array.from(r.text));
  }
  const items = page.flatMap((r): AnonQueueItem[] => {
    const p = AnonPayload.safeParse(r.payload);
    if (!p.success) return [];
    const chars = r.subjectId ? texts.get(r.subjectId) : undefined;
    const slice = (a: number, b: number) =>
      chars ? chars.slice(Math.max(0, a), Math.max(0, b)).join('') : '';
    const spans = p.data.items.slice(0, ANON_SPANS_SHOWN).map((s) => ({
      entity: s.entity,
      mask: s.mask,
      detector: s.detector ?? null,
      score: s.score ?? null,
      before: slice(s.charStart - CONTEXT, s.charStart),
      span: slice(s.charStart, s.charEnd),
      after: slice(s.charEnd, s.charEnd + CONTEXT),
    }));
    return [
      {
        id: r.id,
        record: r.subjectId ? (refs.get(r.subjectId) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
        anonymizationVersion: p.data.anonymizationVersion ?? null,
        childStrict: p.data.childStrict ?? false,
        blocked: p.data.blocked ?? null,
        spans,
        more: Math.max(0, p.data.items.length - spans.length),
      },
    ];
  });
  return { items, next: rows.length > PAGE ? offset + PAGE : null };
}

/** Requests still bekliyor past the 72 hour hiding deadline (the screen's banner). */
export async function overdueHideCount(ctx: AuthContext): Promise<number> {
  const T = schema.takedownRequests;
  const rows = await ctx.db
    .select({ id: T.id })
    .from(T)
    .where(and(eq(T.status, 'bekliyor'), lte(T.hideDueAt, ctx.now())));
  return rows.length;
}
