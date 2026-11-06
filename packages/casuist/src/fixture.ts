import data from '../fixtures/kayitlar.json' with { type: 'json' };
import { MemoryBackend } from './memory.ts';
import { resolveNorms } from './norms.ts';
import type { CorpusRecord, StoredNormRef } from './types.ts';
import { trigramEmbedder } from './vector.ts';

/**
 * Fixture corpus (packages/casuist/fixtures, provenance in KAYNAK.md): KVKK in full, TBK m.49-75, five
 * Constitution articles, seven Yargıtay decisions published anonymised at source, one KVKK Board summary and
 * GDPR Art. 1-2. For tests, the evaluation set and local development only; production reads the corpus database.
 */
export const FIXTURE_VERSION: string = data.surum;

/** Distinct law and article pairs cited in a text (stored norm_refs are resolved at ingest time). */
export function citedNorms(text: string): StoredNormRef[] {
  const seen = new Set<string>();
  const out: StoredNormRef[] = [];
  for (const n of resolveNorms(text)) {
    const k = `${n.kanunNo}|${n.madde}|${n.fikra ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ kanunNo: n.kanunNo, madde: n.madde, fikra: n.fikra, bent: n.bent });
  }
  return out;
}

type Raw = (typeof data.kayitlar)[number];

function toRecord(r: Raw): CorpusRecord {
  const normRefs: StoredNormRef[] = r.normRefs.length
    ? r.normRefs.map((n) => ({ kanunNo: n.kanunNo, madde: n.madde }))
    : citedNorms(r.text);
  return {
    id: r.id,
    type: r.type as CorpusRecord['type'],
    title: r.title,
    court: r.court,
    chamber: r.chamber,
    esasNo: r.esasNo,
    kararNo: r.kararNo,
    date: r.date,
    authorityClass: r.authorityClass as CorpusRecord['authorityClass'],
    status: r.status as CorpusRecord['status'],
    jurisdiction: r.jurisdiction,
    normRefs,
    validFrom: r.validFrom,
    validTo: r.validTo,
    amendedBy: r.amendedBy,
    licenseBasis: r.licenseBasis,
    anonymized: r.anonymized,
    anonymizationVersion: r.anonymizationVersion,
    sourceUrl: r.sourceUrl,
    fetchedAt: r.fetchedAt,
    lang: r.lang,
    openalexCitedBy: r.openalexCitedBy,
    citedByCount: r.citedByCount,
    text: r.text,
  };
}

let cached: CorpusRecord[] | undefined;

export function fixtureRecords(): CorpusRecord[] {
  cached ??= data.kayitlar.map(toRecord);
  return cached;
}

let backend: Promise<MemoryBackend> | undefined;

/** Shared fixture index with the trigram vector leg built once per process. */
export function fixtureBackend(): Promise<MemoryBackend> {
  backend ??= new MemoryBackend(fixtureRecords()).index(FIXTURE_EMBEDDER);
  return backend;
}

export const FIXTURE_EMBEDDER = trigramEmbedder(256);
/** Trigram vectors share many trigrams across any Turkish text; below this they are noise. */
export const FIXTURE_MIN_SIMILARITY = 0.3;

/** Search dependencies over the fixture corpus. */
export async function fixtureSearchDeps(): Promise<{
  backend: MemoryBackend;
  embedder: typeof FIXTURE_EMBEDDER;
  minSimilarity: number;
}> {
  return {
    backend: await fixtureBackend(),
    embedder: FIXTURE_EMBEDDER,
    minSimilarity: FIXTURE_MIN_SIMILARITY,
  };
}
