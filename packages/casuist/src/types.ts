import type { AuthorityClass, RecordStatus, RecordType, components } from '@kazuist/contracts';

export type Label = components['schemas']['Label'];
export type RecordSummary = components['schemas']['RecordSummary'];
export type ApiRecord = components['schemas']['Record'];
export type NormRef = components['schemas']['NormRef'];
export type SearchResponse = components['schemas']['SearchResponse'];

/** A norm reference stored on a record (records.norm_refs). */
export interface StoredNormRef {
  kanunNo: string;
  madde: string;
  fikra?: string | null;
  bent?: string | null;
}

/**
 * A servable corpus record. `text` is always records.masked_text (ADR-0023): raw text never reaches this type.
 */
export interface CorpusRecord {
  id: string;
  type: RecordType;
  title: string;
  court: string | null;
  chamber: string | null;
  esasNo: string | null;
  kararNo: string | null;
  /** Decision or publication date, ISO yyyy-mm-dd. */
  date: string | null;
  authorityClass: AuthorityClass;
  status: RecordStatus;
  jurisdiction: string;
  normRefs: StoredNormRef[];
  validFrom: string | null;
  validTo: string | null;
  amendedBy: string | null;
  licenseBasis: string;
  anonymized: boolean;
  anonymizationVersion: string | null;
  sourceUrl: string;
  /** ISO date-time the source was fetched (Veri günü). */
  fetchedAt: string;
  lang?: string;
  openalexCitedBy?: number | null;
  /** Incoming citation edges (atıf ağı), when known. */
  citedByCount?: number | null;
  liveOnly?: boolean;
  text: string;
}

/**
 * A passage (chunks row). charStart and charEnd index records.masked_text in UTF-16 units; text is that slice,
 * except that the panel member names an open source keeps readable in masked_text are written "[Üye n]"
 * (services/worker-py/nlp/panel_names.py, plan Ek E), so search, embeddings and prompts never carry them.
 */
export interface Chunk {
  id: string;
  recordId: string;
  seq: number;
  section: string | null;
  text: string;
  charStart: number;
  charEnd: number;
}

export interface SearchFilters {
  type?: RecordType;
  from?: string;
  to?: string;
  court?: string;
  authority?: AuthorityClass;
}

/** One hit of a retrieval leg. `chunk` is the passage that matched best, when the leg knows it. */
export interface Hit {
  id: string;
  chunk?: Chunk | null;
  /** Leg specific score (ts_rank, cosine similarity). */
  score?: number;
}

export type Leg = 'kimlik' | 'tam_metin' | 'vektor';
