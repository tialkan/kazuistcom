import type { ParsedQuery } from './query.ts';
import type { Chunk, CorpusRecord, Hit, SearchFilters } from './types.ts';

/**
 * Storage side of hybrid retrieval (plan 7.2). Two implementations: PostgreSQL (`sqlBackend`, production) and
 * the in-memory fixture index (`MemoryBackend`, tests, evaluation and local development without a corpus).
 * Every implementation serves only servable records: masked text present and not hidden (ADR-0023).
 */
export interface SearchBackend {
  readonly name: string;
  /** Exact identity: esas and karar number, or the article record of a resolved norm (plan 7.2/1). */
  identity(q: ParsedQuery, f: SearchFilters, limit: number): Promise<Hit[]>;
  /** Full text, title weighted (plan 7.2/2). */
  fullText(q: ParsedQuery, f: SearchFilters, limit: number): Promise<Hit[]>;
  /** Nearest passages by embedding (plan 7.2/3); absent when the store has no vectors for this model. */
  vector?(embedding: number[], model: string, f: SearchFilters, limit: number): Promise<Hit[]>;
  /** Records by id, servable only, in no particular order. */
  records(ids: string[]): Promise<CorpusRecord[]>;
  /** Best passages of the given records for the query, at most `perRecord` each (plan 7.4/1). */
  passages(q: ParsedQuery, ids: string[], perRecord: number, embedding?: number[] | null): Promise<Chunk[]>;
}
