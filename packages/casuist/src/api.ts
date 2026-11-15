import { lawByNo } from './laws.ts';
import { computeLabels } from './labels.ts';
import type { RankedRecord, SearchResult } from './search.ts';
import type { ApiRecord, CorpusRecord, NormRef, RecordSummary, SearchResponse } from './types.ts';

/** Card excerpt: the best passage cut at a word boundary. */
export function snippet(text: string | null | undefined, max = 320): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.lastIndexOf(' ', max);
  return `${t.slice(0, cut > max * 0.6 ? cut : max)} …`;
}

const dateTime = (s: string): string | null =>
  Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null;

/** Contract RecordSummary (openapi components.schemas.RecordSummary). */
export function toSummary(r: RankedRecord): RecordSummary {
  const x = r.record;
  return {
    id: x.id,
    type: x.type,
    title: x.title,
    court: x.court,
    chamber: x.chamber,
    esasNo: x.esasNo,
    kararNo: x.kararNo,
    date: x.date,
    authorityClass: x.authorityClass,
    status: x.status,
    labels: r.labels,
    snippet: snippet(r.chunk?.text ?? x.text),
    liveOnly: x.liveOnly ?? false,
    fetchedAt: dateTime(x.fetchedAt),
  };
}

export function toNormRef(n: {
  kanunNo: string;
  madde: string;
  fikra?: string | null;
  bent?: string | null;
}): NormRef {
  return {
    kanunNo: n.kanunNo,
    kanunAdi: lawByNo(n.kanunNo)?.ad ?? null,
    madde: n.madde,
    fikra: n.fikra ?? null,
    bent: n.bent ?? null,
    recordId: null,
  };
}

/**
 * Contract SearchResponse. `degraded` lists retrieval legs that could not run (e.g. "vektor" without an
 * embedding service) and is present only when not empty, so clients can say the results are keyword only. The
 * SearchResponse object is open (no additionalProperties: false); declaring the field in the contract is
 * requested in docs/istekler/casuist-arama-kalitesi.md.
 */
export function toSearchResponse(res: SearchResult): SearchResponse & { degraded?: string[] } {
  return {
    items: res.items.map(toSummary),
    live: res.live.map(toSummary),
    resolvedNorms: res.query.norms.map(toNormRef),
    page: res.page,
    total: res.total,
    ...(res.degraded.length ? { degraded: [...res.degraded] } : {}),
  };
}

/** Contract Record: the servable (masked) text only; raw text never leaves the store (ADR-0023). */
export function toApiRecord(x: CorpusRecord, now: Date = new Date()): ApiRecord {
  return {
    id: x.id,
    type: x.type,
    title: x.title,
    court: x.court,
    chamber: x.chamber,
    esasNo: x.esasNo,
    kararNo: x.kararNo,
    date: x.date,
    authorityClass: x.authorityClass,
    status: x.status,
    labels: computeLabels(x, null, now),
    snippet: snippet(x.text),
    liveOnly: x.liveOnly ?? false,
    fetchedAt: dateTime(x.fetchedAt),
    jurisdiction: x.jurisdiction,
    normRefs: x.normRefs.map(toNormRef),
    validFrom: x.validFrom,
    validTo: x.validTo,
    amendedBy: x.amendedBy,
    licenseBasis: x.licenseBasis,
    anonymized: x.anonymized,
    anonymizationVersion: x.anonymizationVersion,
    sourceUrl: x.sourceUrl,
    text: x.text,
  };
}
