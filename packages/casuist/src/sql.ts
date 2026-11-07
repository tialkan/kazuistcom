import type { SearchBackend } from './backend.ts';
import { chunkText } from './chunk.ts';
import { decisionKey } from './decisions.ts';
import { words } from './normalize.ts';
import type { ParsedQuery } from './query.ts';
import type { Chunk, CorpusRecord, Hit, SearchFilters } from './types.ts';

/** pg.Pool, pg.PoolClient and PGlite all satisfy this. */
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** A pool that can hand out a session (pg.Pool); used to scope `SET LOCAL hnsw.ef_search` to one query. */
export interface SqlPool extends SqlClient {
  connect?(): Promise<SqlClient & { release(): void }>;
}

/**
 * Servable rows only (ADR-0023, mimar-yonlendirme-casuist-kampus-seo madde 1): masked text present and not hidden
 * by a takedown. Raw records.text is never selected.
 */
const SERVABLE = 'r.masked_text IS NOT NULL AND r.hidden_at IS NULL';

const RECORD_COLUMNS = `r.id, r.type, r.title, r.court, r.chamber, r.esas_no, r.karar_no,
  to_char(r.decision_date, 'YYYY-MM-DD') AS decision_date, r.authority_class, r.status, r.jurisdiction,
  r.norm_refs, to_char(r.valid_from, 'YYYY-MM-DD') AS valid_from, to_char(r.valid_to, 'YYYY-MM-DD') AS valid_to,
  r.amended_by, r.license_basis, r.anonymized, r.anonymization_version, r.source_url, r.fetched_at, r.live_only,
  r.openalex_cited_by, r.masked_text`;

interface RecordRow {
  id: string;
  type: CorpusRecord['type'];
  title: string;
  court: string | null;
  chamber: string | null;
  esas_no: string | null;
  karar_no: string | null;
  decision_date: string | null;
  authority_class: CorpusRecord['authorityClass'];
  status: CorpusRecord['status'];
  jurisdiction: string;
  norm_refs: CorpusRecord['normRefs'] | null;
  valid_from: string | null;
  valid_to: string | null;
  amended_by: string | null;
  license_basis: string;
  anonymized: boolean;
  anonymization_version: string | null;
  source_url: string;
  fetched_at: string | Date;
  live_only: boolean;
  openalex_cited_by: number | null;
  masked_text: string;
  cited_by?: number | string | null;
}

interface ChunkRow {
  id: string;
  record_id: string;
  seq: number;
  section: string | null;
  text: string;
  char_start: number;
  char_end: number;
  score?: number | string;
}

const toChunk = (c: ChunkRow): Chunk => ({
  id: c.id,
  recordId: c.record_id,
  seq: c.seq,
  section: c.section,
  text: c.text,
  charStart: c.char_start,
  charEnd: c.char_end,
});

function toRecord(r: RecordRow): CorpusRecord {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    court: r.court,
    chamber: r.chamber,
    esasNo: r.esas_no,
    kararNo: r.karar_no,
    date: r.decision_date,
    authorityClass: r.authority_class,
    status: r.status,
    jurisdiction: r.jurisdiction,
    normRefs: r.norm_refs ?? [],
    validFrom: r.valid_from,
    validTo: r.valid_to,
    amendedBy: r.amended_by,
    licenseBasis: r.license_basis,
    anonymized: r.anonymized,
    anonymizationVersion: r.anonymization_version,
    sourceUrl: r.source_url,
    fetchedAt: r.fetched_at instanceof Date ? r.fetched_at.toISOString() : String(r.fetched_at),
    liveOnly: r.live_only,
    openalexCitedBy: r.openalex_cited_by,
    citedByCount: r.cited_by === null || r.cited_by === undefined ? null : Number(r.cited_by),
    text: r.masked_text,
  };
}

/** Filter clause and parameters, numbered from `start`. LIKE wildcards in the court filter are escaped. */
export function filterSql(f: SearchFilters, start: number): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const add = (clause: (n: number) => string, value: unknown): void => {
    params.push(value);
    parts.push(clause(start + params.length - 1));
  };
  if (f.type) add((n) => `r.type = $${n}::record_type`, f.type);
  if (f.authority) add((n) => `r.authority_class = $${n}::authority_class`, f.authority);
  if (f.from) add((n) => `r.decision_date >= $${n}::date`, f.from);
  if (f.to) add((n) => `r.decision_date <= $${n}::date`, f.to);
  if (f.court)
    add(
      (n) => `(coalesce(r.court, '') || ' ' || coalesce(r.chamber, '')) ILIKE $${n}`,
      `%${f.court.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    );
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
}

/**
 * OR query for to_tsquery('turkish', ...): letters and digits only, so user input cannot inject tsquery
 * operators. The Turkish snowball configuration stems and drops stop words.
 */
export function orTsQuery(q: ParsedQuery): string {
  const list = [...new Set(words(q.raw).filter((t) => /^[\p{L}\p{N}]+$/u.test(t)))].slice(0, 32);
  return list.join(' | ');
}

/** Title matches weigh more than passage matches (plan 7.2/2). Ranks are length normalised (flag 1). */
const TITLE_WEIGHT = 3;

export interface SqlBackendOptions {
  /** hnsw.ef_search for the vector leg; must be at least the leg limit to return that many rows. */
  efSearch?: number;
}

/**
 * PostgreSQL backend over packages/db tables: records (title_tsv), chunks (tsv, embedding halfvec(1024) with
 * the HNSW cosine index), citation_edges for the incoming citation count.
 */
export function sqlBackend(db: SqlPool, opts: SqlBackendOptions = {}): SearchBackend {
  const efSearch = Math.max(40, Math.min(1000, opts.efSearch ?? 200));

  async function records(ids: string[]): Promise<CorpusRecord[]> {
    if (!ids.length) return [];
    const { rows } = await db.query<RecordRow>(
      `SELECT ${RECORD_COLUMNS},
        (SELECT count(*) FROM citation_edges e WHERE e.to_record_id = r.id) AS cited_by
       FROM records r WHERE r.id = ANY($1::uuid[]) AND ${SERVABLE}`,
      [ids],
    );
    return rows.map(toRecord);
  }

  return {
    name: 'postgres',

    async identity(q, f, limit) {
      const decisions = q.decisions
        .filter((d) => d.esasNo || d.kararNo)
        .map((d) => ({
          e: d.esasNo ? decisionKey(d.esasNo) : null,
          k: d.kararNo ? decisionKey(d.kararNo) : null,
        }));
      const norms = q.norms.map((n) => ({ k: n.kanunNo, m: n.madde }));
      if (!decisions.length && !norms.length) return [];
      const filter = filterSql(f, 4);
      const { rows } = await db.query<{ id: string }>(
        `SELECT r.id FROM records r
         WHERE ${SERVABLE}${filter.sql} AND (
           EXISTS (SELECT 1 FROM jsonb_array_elements($1::jsonb) d
                   WHERE (d->>'e' IS NULL OR replace(r.esas_no, ' ', '') = d->>'e')
                     AND (d->>'k' IS NULL OR replace(r.karar_no, ' ', '') = d->>'k'))
           OR (r.type NOT IN ('karar', 'kurul_karari') AND EXISTS (
                   SELECT 1 FROM jsonb_array_elements(coalesce(r.norm_refs, '[]'::jsonb)) n,
                                 jsonb_array_elements($2::jsonb) q
                   WHERE n->>'kanunNo' = q->>'k' AND n->>'madde' = q->>'m')))
         LIMIT $3`,
        [JSON.stringify(decisions), JSON.stringify(norms), limit, ...filter.params],
      );
      return rows.map((r) => ({ id: r.id, score: 1 }));
    },

    async fullText(q, f, limit) {
      const tsq = orTsQuery(q);
      if (!tsq) return [];
      const filter = filterSql(f, 3);
      const { rows } = await db.query<ChunkRow & { rid: string; chunk_id: string | null }>(
        `WITH q AS (SELECT to_tsquery('turkish', $1) AS tq),
         c AS (
           SELECT DISTINCT ON (ch.record_id) ch.record_id, ch.id AS chunk_id, ch.seq, ch.section, ch.text,
                  ch.char_start, ch.char_end, ts_rank_cd(ch.tsv, q.tq, 1) AS rank
           FROM chunks ch, q WHERE ch.tsv @@ q.tq
           ORDER BY ch.record_id, rank DESC, ch.seq),
         t AS (SELECT r.id AS record_id, ts_rank_cd(r.title_tsv, q.tq, 1) AS trank
               FROM records r, q WHERE r.title_tsv @@ q.tq)
         SELECT r.id AS rid, c.chunk_id, c.seq, c.section, c.text, c.char_start, c.char_end,
                coalesce(c.rank, 0) + ${TITLE_WEIGHT} * coalesce(t.trank, 0) AS score
         FROM records r
         LEFT JOIN c ON c.record_id = r.id
         LEFT JOIN t ON t.record_id = r.id
         WHERE (c.record_id IS NOT NULL OR t.record_id IS NOT NULL) AND ${SERVABLE}${filter.sql}
         ORDER BY score DESC, r.id
         LIMIT $2`,
        [tsq, limit, ...filter.params],
      );
      return rows.map((row): Hit => ({
        id: row.rid,
        score: Number(row.score),
        chunk: row.chunk_id ? toChunk({ ...row, id: row.chunk_id, record_id: row.rid }) : null,
      }));
    },

    async vector(embedding, model, f, limit) {
      const filter = filterSql(f, 4);
      const sql = `SELECT x.id, x.record_id, x.seq, x.section, x.text, x.char_start, x.char_end, 1 - x.d AS score
        FROM (SELECT ch.*, ch.embedding <=> $1::halfvec AS d FROM chunks ch
              WHERE ch.embedding IS NOT NULL AND ch.embedding_model = $2
              ORDER BY ch.embedding <=> $1::halfvec LIMIT $3) x
        JOIN records r ON r.id = x.record_id
        WHERE ${SERVABLE}${filter.sql}
        ORDER BY x.d`;
      const params = [`[${embedding.join(',')}]`, model, limit * 3, ...filter.params];
      let rows: ChunkRow[];
      if (db.connect) {
        const c = await db.connect();
        try {
          await c.query('BEGIN');
          await c.query(`SET LOCAL hnsw.ef_search = ${efSearch}`);
          rows = (await c.query<ChunkRow>(sql, params)).rows;
          await c.query('COMMIT');
        } catch (e) {
          await c.query('ROLLBACK').catch(() => undefined);
          throw e;
        } finally {
          c.release();
        }
      } else rows = (await db.query<ChunkRow>(sql, params)).rows;
      const best = new Map<string, Hit>();
      for (const row of rows) {
        if (best.has(row.record_id)) continue;
        best.set(row.record_id, { id: row.record_id, score: Number(row.score), chunk: toChunk(row) });
        if (best.size >= limit) break;
      }
      return [...best.values()];
    },

    records,

    async passages(q, ids, perRecord) {
      if (!ids.length) return [];
      const tsq = orTsQuery(q) || 'xxxxxxxx';
      const { rows } = await db.query<ChunkRow>(
        `SELECT * FROM (
           SELECT ch.id, ch.record_id, ch.seq, ch.section, ch.text, ch.char_start, ch.char_end,
                  row_number() OVER (PARTITION BY ch.record_id
                                     ORDER BY ts_rank_cd(ch.tsv, to_tsquery('turkish', $2)) DESC, ch.seq) AS n
           FROM chunks ch JOIN records r ON r.id = ch.record_id
           WHERE ch.record_id = ANY($1::uuid[]) AND ${SERVABLE}) x
         WHERE x.n <= $3 ORDER BY x.record_id, x.n`,
        [ids, tsq, perRecord],
      );
      const out = rows.map(toChunk);
      // Records whose chunks are not written yet (embed.chunks pending) fall back to on the fly passages.
      const missing = ids.filter((id) => !out.some((c) => c.recordId === id));
      if (missing.length)
        for (const r of await records(missing)) out.push(...chunkText(r.id, r.text).slice(0, perRecord));
      return out;
    },
  };
}
