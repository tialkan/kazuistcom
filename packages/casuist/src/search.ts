import type { RecordType } from '@kazuist/contracts';
import type { SearchBackend } from './backend.ts';
import { computeLabels } from './labels.ts';
import { terms } from './normalize.ts';
import { normMatches, type ResolvedNorm } from './norms.ts';
import { parseQuery, type ParsedQuery } from './query.ts';
import { fuse, maxRrf, RRF_K } from './rrf.ts';
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  importance,
  relevance,
  type LabelThresholds,
  type RankingWeights,
} from './scoring.ts';
import type { Chunk, CorpusRecord, Hit, Label, Leg, SearchFilters } from './types.ts';
import type { Embedder } from './vector.ts';

export const PAGE_SIZE = 10;
/** Candidates per leg (plan 7.2/2-3). */
export const LEG_LIMIT = 100;
/** Live federation budget (plan 7.2/7, FR-83). */
export const LIVE_TIMEOUT_MS = 1200;

export type SortOrder = 'ilgililik' | 'onem' | 'tarih_yeni' | 'tarih_eski';

/** Live official source (plan 6.2/9, FR-83). Receives the masked query only. */
export interface LiveSource {
  readonly name: string;
  search(maskedQuery: string, signal: AbortSignal): Promise<CorpusRecord[]>;
}

export interface SearchDeps {
  backend: SearchBackend;
  embedder?: Embedder | null;
  live?: LiveSource[];
  weights?: RankingWeights;
  thresholds?: LabelThresholds;
  now?: () => Date;
  /** Masks the query before it leaves the server (embedding service, live sources). Identity by default. */
  mask?: (q: string) => Promise<string> | string;
  /** Vector hits below this similarity are not candidates; tuned per embedding model with eval/embed. */
  minSimilarity?: number;
}

export interface SearchInput extends SearchFilters {
  q: string;
  sort?: SortOrder;
  page?: number;
  pageSize?: number;
}

export interface RankedRecord {
  record: CorpusRecord;
  relevance: number;
  importance: number;
  labels: Label[];
  /** Best matching passage, for the card excerpt and the summary context. */
  chunk: Chunk | null;
  legs: Leg[];
  identity: boolean;
  matchedNorms: ResolvedNorm[];
  /** Query terms found in the title or the passage (folded stems), for "neden ilgili" (FR-11). */
  matchedTerms: string[];
}

export interface SearchResult {
  query: ParsedQuery;
  items: RankedRecord[];
  live: RankedRecord[];
  page: number;
  pageSize: number;
  total: number;
  /** Result counts per type before the type filter (FR-09). */
  counts: Partial<Record<RecordType, number>> & { tumu: number };
  /** Legs that could not run, e.g. "vektor" without an embedding service; shown to operators, not users. */
  degraded: string[];
  timings: { totalMs: number; liveMs: number | null };
}

const normCovered = (q: ResolvedNorm, r: CorpusRecord): boolean =>
  r.normRefs.some((x) => normMatches(q, { kanunNo: x.kanunNo, madde: x.madde, fikra: x.fikra ?? null }));

function matched(queryTerms: string[], text: string): string[] {
  const have = new Set(terms(text));
  return queryTerms.filter((t) => have.has(t));
}

function sortRanked(list: RankedRecord[], sort: SortOrder): RankedRecord[] {
  const byDate = (a: RankedRecord, b: RankedRecord): number =>
    (a.record.date ?? '').localeCompare(b.record.date ?? '');
  const cmp: Record<SortOrder, (a: RankedRecord, b: RankedRecord) => number> = {
    ilgililik: (a, b) =>
      Number(b.identity) - Number(a.identity) || b.relevance - a.relevance || b.importance - a.importance,
    onem: (a, b) => b.importance - a.importance || b.relevance - a.relevance,
    tarih_yeni: (a, b) => byDate(b, a) || b.relevance - a.relevance,
    tarih_eski: (a, b) => {
      // Undated records go last in both date orders.
      if (!a.record.date !== !b.record.date) return a.record.date ? -1 : 1;
      return byDate(a, b) || b.relevance - a.relevance;
    },
  };
  if (sort === 'tarih_yeni') {
    return [...list].sort((a, b) => {
      if (!a.record.date !== !b.record.date) return a.record.date ? -1 : 1;
      return cmp.tarih_yeni(a, b);
    });
  }
  return [...list].sort(cmp[sort]);
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      ctl.abort();
      resolve(null);
    }, ms);
  });
  try {
    return await Promise.race([run(ctl.signal).catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hybrid retrieval (plan 7.2): identity first, full text and vector top 100 fused with RRF (k=60), relevance and
 * importance scores, labels (7.3) and the live federation section within 1.2 seconds (FR-83).
 */
export async function search(input: SearchInput, deps: SearchDeps): Promise<SearchResult> {
  const started = Date.now();
  const now = deps.now?.() ?? new Date();
  const weights = deps.weights ?? DEFAULT_WEIGHTS;
  const thresholds = deps.thresholds ?? DEFAULT_THRESHOLDS;
  const sort = input.sort ?? 'ilgililik';
  const pageSize = input.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, input.page ?? 1);
  const q = parseQuery(input.q);
  // Type is applied after counting (FR-09); the other filters narrow every leg.
  const filters: SearchFilters = {
    ...(input.from ? { from: input.from } : {}),
    ...(input.to ? { to: input.to } : {}),
    ...(input.court ? { court: input.court } : {}),
    ...(input.authority ? { authority: input.authority } : {}),
  };
  const degraded: string[] = [];
  const masked = deps.mask ? await deps.mask(input.q) : input.q;

  const liveStarted = Date.now();
  const livePromise = deps.live?.length
    ? Promise.all(
        deps.live.map((src) => withTimeout(LIVE_TIMEOUT_MS, (signal) => src.search(masked, signal))),
      )
    : null;

  let embedding: number[] | null = null;
  const vectorLeg = async (): Promise<Hit[] | null> => {
    if (!deps.embedder || !deps.backend.vector) return null;
    try {
      [embedding] = (await deps.embedder.embed([masked], 'query')) as [number[]];
      const hits = await deps.backend.vector(embedding, deps.embedder.model, filters, LEG_LIMIT);
      const floor = deps.minSimilarity ?? 0;
      return hits.filter((h) => (h.score ?? 0) >= floor);
    } catch {
      return null;
    }
  };
  const [identityHits, ftsHits, vecHits] = await Promise.all([
    q.norms.length || q.decisions.length ? deps.backend.identity(q, filters, 20) : Promise.resolve([]),
    deps.backend.fullText(q, filters, LEG_LIMIT),
    vectorLeg(),
  ]);
  if (vecHits === null) degraded.push('vektor');

  const lists = [ftsHits.map((h) => h.id), ...(vecHits ? [vecHits.map((h) => h.id)] : [])];
  const fused = fuse(lists, RRF_K);
  const legsRan = lists.length;
  const identityIds = new Set(identityHits.map((h) => h.id));
  const ids = [...new Set([...identityIds, ...fused.map((f) => f.id)])];
  const records = new Map((await deps.backend.records(ids)).map((r) => [r.id, r]));
  const fusedScore = new Map(fused.map((f) => [f.id, f.score]));
  const ftsChunk = new Map(ftsHits.map((h) => [h.id, h.chunk ?? null]));
  const vec = new Map((vecHits ?? []).map((h) => [h.id, h]));
  const ftsIds = new Set(ftsHits.map((h) => h.id));

  // Identity matches without a passage get their best passage from the store.
  const needPassage = ids.filter((id) => !ftsChunk.get(id) && !vec.get(id)?.chunk);
  const extra = needPassage.length ? await deps.backend.passages(q, needPassage, 1, embedding) : [];
  const extraChunk = new Map(extra.map((c) => [c.recordId, c]));

  const ranked: RankedRecord[] = [];
  for (const id of ids) {
    const record = records.get(id);
    if (!record) continue;
    const chunk = ftsChunk.get(id) ?? vec.get(id)?.chunk ?? extraChunk.get(id) ?? null;
    const matchedTerms = [...new Set(matched(q.terms, `${record.title}\n${chunk?.text ?? ''}`))];
    const matchedNorms = q.norms.filter((n) => normCovered(n, record));
    const identity = identityIds.has(id);
    const rel = relevance(
      {
        fusedNorm: (fusedScore.get(id) ?? 0) / maxRrf(Math.max(1, legsRan)),
        coverage: q.terms.length ? matchedTerms.length / q.terms.length : 0,
        similarity: vec.get(id)?.score ?? null,
        normMatch: matchedNorms.length > 0,
        identity,
      },
      weights,
    );
    const legs: Leg[] = [
      ...(identity ? (['kimlik'] as const) : []),
      ...(ftsIds.has(id) ? (['tam_metin'] as const) : []),
      ...(vec.has(id) ? (['vektor'] as const) : []),
    ];
    ranked.push({
      record,
      relevance: rel,
      importance: importance(record, weights),
      labels: computeLabels(record, rel, now, thresholds),
      chunk,
      legs,
      identity,
      matchedNorms,
      matchedTerms,
    });
  }

  const counts: SearchResult['counts'] = { tumu: ranked.length };
  for (const r of ranked) counts[r.record.type] = (counts[r.record.type] ?? 0) + 1;
  const filtered = input.type ? ranked.filter((r) => r.record.type === input.type) : ranked;
  const sorted = sortRanked(filtered, sort);

  let live: RankedRecord[] = [];
  let liveMs: number | null = null;
  if (livePromise) {
    const results = await livePromise;
    liveMs = Date.now() - liveStarted;
    const seen = new Set(ranked.map((r) => r.record.id));
    live = results
      .flatMap((list) => list ?? [])
      .filter((r) => !seen.has(r.id))
      .map((r) => {
        const record = { ...r, liveOnly: true };
        return {
          record,
          relevance: 0,
          importance: importance(record, weights),
          labels: computeLabels(record, null, now, thresholds),
          chunk: null,
          legs: [],
          identity: false,
          matchedNorms: q.norms.filter((n) => normCovered(n, record)),
          matchedTerms: [],
        };
      });
  }

  return {
    query: q,
    items: sorted.slice((page - 1) * pageSize, page * pageSize),
    live,
    page,
    pageSize,
    total: sorted.length,
    counts,
    degraded,
    timings: { totalMs: Date.now() - started, liveMs },
  };
}
