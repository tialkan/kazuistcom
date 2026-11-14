import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthContext } from './context.ts';
import { schema, type Db } from './db.ts';

/**
 * Citation review queue (review_queue.queue = 'citations', plan 10.9). services/worker-py/citations writes one
 * item per candidate below the publish threshold: subject_type 'citation_edge', subject_id the citation_edges row
 * (kind karar) or the work_citations row (kind doktrin), payload built by pipeline.py queue_row. The context is a
 * slice of masked text, never raw text.
 *
 * Editor decisions (contract v1.5, ADR-0035): onay writes confirmed = true; ret writes rejected = true and leaves
 * confirmed false, so no serving query (confirmed or confidence >= 0.90, NOT rejected) draws the edge. The pre
 * v1.5 form (confirmed = true, confidence = 0) is no longer written; confidence keeps the extractor's value.
 */

const KararCandidate = z.object({
  kind: z.string().nullish(),
  esas: z.string().nullish(),
  karar: z.string().nullish(),
  number: z.string().nullish(),
  court: z.string().nullish(),
  chamber: z.string().nullish(),
  date: z.string().nullish(),
  toRecordId: z.string().nullish(),
  toRaw: z.string().nullish(),
});

const DoktrinCandidate = z.object({
  work: z.object({
    key: z.string().nullish(),
    title: z.string().nullish(),
    authors: z.array(z.string()).nullish(),
    kind: z.string().nullish(),
    venue: z.string().nullish(),
    editions: z.array(z.object({ year: z.union([z.string(), z.number()]).nullish() }).loose()).nullish(),
  }),
  pages: z.array(z.string()).nullish(),
});

/** Payload of a citations item; read loosely because the producer is Python and may add fields. */
export const CitationQueuePayload = z.discriminatedUnion('kind', [
  z.object({
    recordId: z.uuid(),
    kind: z.literal('karar'),
    confidence: z.number(),
    reasons: z.array(z.string()).default([]),
    context: z.string().default(''),
    candidate: KararCandidate,
  }),
  z.object({
    recordId: z.uuid(),
    kind: z.literal('doktrin'),
    confidence: z.number(),
    reasons: z.array(z.string()).default([]),
    context: z.string().default(''),
    candidate: DoktrinCandidate,
  }),
]);
export type CitationQueuePayload = z.infer<typeof CitationQueuePayload>;

export interface CitationQueueItem {
  id: string;
  createdAt: string;
  payload: CitationQueuePayload;
  /** Citing decision, for the editor's orientation. */
  source: { title: string; court: string | null; esasNo: string | null; kararNo: string | null } | null;
}

const PAGE = 50;

/** Open items for the editor screen, highest priority first; malformed payloads are left out. */
export async function listCitationQueue(
  ctx: AuthContext,
  offset = 0,
): Promise<{ items: CitationQueueItem[]; next: number | null }> {
  const rows = await ctx.db
    .select()
    .from(schema.reviewQueueItems)
    .where(and(eq(schema.reviewQueueItems.queue, 'citations'), isNull(schema.reviewQueueItems.decision)))
    .orderBy(desc(schema.reviewQueueItems.priority), asc(schema.reviewQueueItems.createdAt))
    .limit(PAGE + 1)
    .offset(offset);
  const page = rows.slice(0, PAGE);
  const parsed = page.flatMap((r) => {
    const p = CitationQueuePayload.safeParse(r.payload);
    return p.success ? [{ row: r, payload: p.data }] : [];
  });
  const ids = [...new Set(parsed.map((x) => x.payload.recordId))];
  const sources = ids.length
    ? await ctx.db
        .select({
          id: schema.records.id,
          title: schema.records.title,
          court: schema.records.court,
          esasNo: schema.records.esasNo,
          kararNo: schema.records.kararNo,
        })
        .from(schema.records)
        .where(inArray(schema.records.id, ids))
    : [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  return {
    items: parsed.map(({ row, payload }) => {
      const s = byId.get(payload.recordId);
      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        payload,
        source: s ? { title: s.title, court: s.court, esasNo: s.esasNo, kararNo: s.kararNo } : null,
      };
    }),
    next: rows.length > PAGE ? offset + PAGE : null,
  };
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Applies onay or ret to the edge behind a citations item inside the caller's transaction. The edge must belong
 * to the item's citing record. Returns whether a row changed (false when the item has no subject, its payload
 * is unreadable or the extractor already removed the edge).
 */
export async function applyCitationDecision(
  tx: Tx,
  item: { subjectType: string; subjectId: string | null; payload: unknown },
  decision: 'onay' | 'ret',
): Promise<{ applied: boolean; kind: 'karar' | 'doktrin' | null }> {
  const parsed = CitationQueuePayload.safeParse(item.payload);
  if (!parsed.success) return { applied: false, kind: null };
  const kind = parsed.data.kind;
  if (item.subjectType !== 'citation_edge' || !item.subjectId) return { applied: false, kind };
  const set =
    decision === 'onay' ? { confirmed: true, rejected: false } : { confirmed: false, rejected: true };
  const table = kind === 'karar' ? schema.citationEdges : schema.workCitations;
  const rows = await tx
    .update(table)
    .set(set)
    .where(and(eq(table.id, item.subjectId), eq(table.fromRecordId, parsed.data.recordId)))
    .returning({ id: table.id });
  return { applied: rows.length > 0, kind };
}
