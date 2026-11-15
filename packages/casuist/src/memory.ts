import type { SearchBackend } from './backend.ts';
import { chunkText, sectionsFor } from './chunk.ts';
import { decisionKey } from './decisions.ts';
import { normalize, terms } from './normalize.ts';
import { normMatches } from './norms.ts';
import { showsPanelNames } from './panel.ts';
import type { ParsedQuery } from './query.ts';
import type { Chunk, CorpusRecord, Hit, SearchFilters } from './types.ts';
import { cosine, type Embedder } from './vector.ts';

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 1.5;

interface Doc {
  chunk: Chunk;
  tf: Map<string, number>;
  len: number;
  vec?: number[];
}

function tf(list: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of list) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** True when a record passes the search filters (plan 7.1/3, Ek C.1 query parameters). */
export function passesFilters(r: CorpusRecord, f: SearchFilters): boolean {
  if (f.type && r.type !== f.type) return false;
  if (f.authority && r.authorityClass !== f.authority) return false;
  if (f.from && (!r.date || r.date < f.from)) return false;
  if (f.to && (!r.date || r.date > f.to)) return false;
  if (f.court) {
    const c = normalize(f.court);
    if (!normalize(`${r.court ?? ''} ${r.chamber ?? ''}`).includes(c)) return false;
  }
  return true;
}

/**
 * In-memory hybrid index over fixture records: BM25 over F5 stemmed terms at passage level with a weighted title
 * field, an optional embedding leg and identity lookup. Used for tests, the evaluation set and local
 * development when no corpus database is configured.
 */
export class MemoryBackend implements SearchBackend {
  readonly name = 'bellek';
  private readonly byId = new Map<string, CorpusRecord>();
  private readonly docs: Doc[] = [];
  private readonly titles = new Map<string, { tf: Map<string, number>; len: number }>();
  private readonly df = new Map<string, number>();
  private readonly titleDf = new Map<string, number>();
  private avgLen = 1;
  private avgTitle = 1;
  private embedderModel: string | null = null;

  constructor(records: CorpusRecord[]) {
    for (const r of records) {
      this.byId.set(r.id, r);
      const t = terms(r.title);
      this.titles.set(r.id, { tf: tf(t), len: t.length });
      for (const term of new Set(t)) this.titleDf.set(term, (this.titleDf.get(term) ?? 0) + 1);
      // A text that may show open panel member names is not cut here (panel.ts); the fixture corpus has none.
      if (showsPanelNames(r.text)) continue;
      for (const chunk of chunkText(r.id, r.text, { sections: sectionsFor(r.type) })) {
        const ct = terms(chunk.text);
        const doc = { chunk, tf: tf(ct), len: ct.length };
        this.docs.push(doc);
        for (const term of doc.tf.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
    }
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
    this.avgTitle = [...this.titles.values()].reduce((s, d) => s + d.len, 0) / Math.max(1, this.titles.size);
  }

  /** Computes passage vectors with the given embedder; the vector leg is off until this runs. */
  async index(embedder: Embedder): Promise<this> {
    const vectors = await embedder.embed(
      this.docs.map((d) => `${this.byId.get(d.chunk.recordId)?.title ?? ''}\n${d.chunk.text}`),
      'passage',
    );
    this.docs.forEach((d, i) => (d.vec = vectors[i]));
    this.embedderModel = embedder.model;
    return this;
  }

  get size(): number {
    return this.byId.size;
  }

  all(): CorpusRecord[] {
    return [...this.byId.values()];
  }

  private idf(df: number, n: number): number {
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  private bm25(
    qt: string[],
    d: { tf: Map<string, number>; len: number },
    df: Map<string, number>,
    n: number,
    avg: number,
  ) {
    let s = 0;
    for (const t of qt) {
      const f = d.tf.get(t);
      if (!f) continue;
      s += (this.idf(df.get(t) ?? 0, n) * f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / avg));
    }
    return s;
  }

  async identity(q: ParsedQuery, f: SearchFilters, limit: number): Promise<Hit[]> {
    const out: Hit[] = [];
    for (const r of this.byId.values()) {
      if (!passesFilters(r, f)) continue;
      const decision = q.decisions.some(
        (d) =>
          (d.esasNo || d.kararNo) &&
          (!d.esasNo || decisionKey(d.esasNo) === decisionKey(r.esasNo)) &&
          (!d.kararNo || decisionKey(d.kararNo) === decisionKey(r.kararNo)),
      );
      const article =
        r.type !== 'karar' &&
        r.type !== 'kurul_karari' &&
        q.norms.some((n) => r.normRefs.some((x) => normMatches(n, { ...x, fikra: x.fikra ?? null })));
      if (decision || article) out.push({ id: r.id, score: 1 });
    }
    return out.slice(0, limit);
  }

  async fullText(q: ParsedQuery, f: SearchFilters, limit: number): Promise<Hit[]> {
    if (!q.terms.length) return [];
    const best = new Map<string, { score: number; chunk: Chunk | null }>();
    const n = this.docs.length;
    for (const d of this.docs) {
      const s = this.bm25(q.terms, d, this.df, n, this.avgLen);
      if (s <= 0) continue;
      const cur = best.get(d.chunk.recordId);
      if (!cur || s > cur.score) best.set(d.chunk.recordId, { score: s, chunk: d.chunk });
    }
    for (const [id, t] of this.titles) {
      const s = this.bm25(q.terms, t, this.titleDf, this.titles.size, this.avgTitle) * TITLE_WEIGHT;
      if (s <= 0) continue;
      const cur = best.get(id);
      best.set(id, { score: (cur?.score ?? 0) + s, chunk: cur?.chunk ?? null });
    }
    return [...best.entries()]
      .filter(([id]) => passesFilters(this.byId.get(id) as CorpusRecord, f))
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([id, v]) => ({ id, chunk: v.chunk, score: v.score }));
  }

  async vector(embedding: number[], model: string, f: SearchFilters, limit: number): Promise<Hit[]> {
    if (this.embedderModel !== model) return [];
    const best = new Map<string, { score: number; chunk: Chunk }>();
    for (const d of this.docs) {
      if (!d.vec) continue;
      const s = cosine(embedding, d.vec);
      const cur = best.get(d.chunk.recordId);
      if (!cur || s > cur.score) best.set(d.chunk.recordId, { score: s, chunk: d.chunk });
    }
    return [...best.entries()]
      .filter(([id, v]) => v.score > 0 && passesFilters(this.byId.get(id) as CorpusRecord, f))
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([id, v]) => ({ id, chunk: v.chunk, score: v.score }));
  }

  async records(ids: string[]): Promise<CorpusRecord[]> {
    return ids.flatMap((id) => {
      const r = this.byId.get(id);
      return r ? [r] : [];
    });
  }

  async passages(
    q: ParsedQuery,
    ids: string[],
    perRecord: number,
    embedding?: number[] | null,
  ): Promise<Chunk[]> {
    const out: Chunk[] = [];
    const n = this.docs.length;
    for (const id of ids) {
      const docs = this.docs.filter((d) => d.chunk.recordId === id);
      const scored = docs
        .map((d) => ({
          d,
          s:
            this.bm25(q.terms, d, this.df, n, this.avgLen) +
            (embedding && d.vec ? 2 * Math.max(0, cosine(embedding, d.vec)) : 0),
        }))
        .sort((a, b) => b.s - a.s || a.d.chunk.seq - b.d.chunk.seq);
      out.push(...scored.slice(0, perRecord).map((x) => x.d.chunk));
    }
    return out;
  }

  async chunks(ids: string[]): Promise<Chunk[]> {
    const wanted = new Set(ids);
    return this.docs.filter((d) => wanted.has(d.chunk.id)).map((d) => d.chunk);
  }
}
