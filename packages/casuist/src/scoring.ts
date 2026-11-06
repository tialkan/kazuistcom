import type { AuthorityClass, RecordStatus } from '@kazuist/contracts';
import type { CorpusRecord } from './types.ts';

/**
 * Ranking weights (plan 7.2/5). Defaults are starting values; the admin panel overrides them through
 * /v1/admin/weights (contracts RankingWeights is a flat number map, see `fromFlatWeights`).
 */
export interface RankingWeights {
  /** Share of the rank fusion score in relevance. */
  fused: number;
  /** Share of query term coverage (title and best passage) in relevance. */
  coverage: number;
  /** Bonus when a norm in the query is the record's own article or is cited by it. */
  normBonus: number;
  /** Bonus for an identity match (esas and karar number, or the exact article). */
  identityBonus: number;
  authority: Record<AuthorityClass, number>;
  /** Heyet bilgisi: general assemblies and unification decisions. */
  board: number;
  /** Incoming citations (atıf ağı), log scaled, saturates at `citationsCap`. */
  citations: number;
  citationsCap: number;
  /** OpenAlex cited_by_count for doctrine, log scaled, saturates at `openalexCap`. */
  openalex: number;
  openalexCap: number;
  statusPenalty: Partial<Record<RecordStatus, number>>;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  fused: 0.45,
  coverage: 0.35,
  normBonus: 0.2,
  identityBonus: 0.3,
  authority: {
    baglayici_norm: 0.6,
    baglayici_karar: 0.6,
    yuksek_emsal: 0.5,
    emsal: 0.35,
    emsal_sinirli: 0.2,
    idari_karar: 0.3,
    doktrin: 0.25,
    karsilastirmali: 0.2,
  },
  board: 0.1,
  citations: 0.2,
  citationsCap: 100,
  openalex: 0.15,
  openalexCap: 500,
  statusPenalty: { degisti: 0.15, yururlukten_kalkti: 0.35, bozuldu: 0.35 },
};

/** Relevance label thresholds (plan 7.2/6), on the 0..1 relevance scale; admin configurable. */
export interface LabelThresholds {
  yuksek: number;
  orta: number;
  /** Years for Yeni (up to) and Yerleşik (up to); older is Eski (SRS 3.3). */
  yeniYil: number;
  yerlesikYil: number;
  /** Öncü: incoming citations or OpenAlex count at or above these. */
  oncuAtif: number;
  oncuOpenalex: number;
  /** Veri günü label when the fetch is older than this many days (Ek D.2/e uses 7). */
  veriGunuGun: number;
}

export const DEFAULT_THRESHOLDS: LabelThresholds = {
  yuksek: 0.6,
  orta: 0.3,
  yeniYil: 3,
  yerlesikYil: 10,
  oncuAtif: 10,
  oncuOpenalex: 100,
  veriGunuGun: 7,
};

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const logScale = (n: number | null | undefined, cap: number): number =>
  n && n > 0 ? clamp01(Math.log1p(n) / Math.log1p(cap)) : 0;

export interface RelevanceInput {
  /** Fused RRF score divided by its maximum for the legs that ran (0..1). */
  fusedNorm: number;
  /** Share of distinct query terms found in the title or the best passage (0..1). */
  coverage: number;
  /** Cosine similarity of the vector leg, when it ran (0..1). */
  similarity?: number | null;
  normMatch: boolean;
  identity: boolean;
}

/** Relevance (plan 7.2/5, SRS 3.4): fused rank, keyword and semantic evidence, norm match bonus. */
export function relevance(i: RelevanceInput, w: RankingWeights = DEFAULT_WEIGHTS): number {
  const evidence = Math.max(i.coverage, i.similarity ?? 0);
  // Rank is relative: the first hit of an off-topic query also ranks first. Scaling it by the absolute evidence
  // keeps such hits in "arka plan" instead of "yüksek".
  return clamp01(
    w.fused * i.fusedNorm * evidence +
      w.coverage * evidence +
      (i.normMatch ? w.normBonus : 0) +
      (i.identity ? w.identityBonus : 0),
  );
}

const BOARD =
  /genel kurul|içtihad[ıi] birleştirme|içtihatları birleştirme|büyük daire|dava daireleri kurulu/i;

/** Importance (plan 7.2/5): authority class, board, citation network, OpenAlex count, status penalty. */
export function importance(
  r: Pick<CorpusRecord, 'authorityClass' | 'chamber' | 'citedByCount' | 'openalexCitedBy' | 'status'>,
  w: RankingWeights = DEFAULT_WEIGHTS,
): number {
  const board = r.chamber && BOARD.test(r.chamber) ? w.board : 0;
  return clamp01(
    w.authority[r.authorityClass] +
      board +
      w.citations * logScale(r.citedByCount, w.citationsCap) +
      w.openalex * logScale(r.openalexCitedBy, w.openalexCap) -
      (w.statusPenalty[r.status] ?? 0),
  );
}

/**
 * Reads the admin panel's flat map (contracts RankingWeights) over the defaults. Keys are the field names, with
 * dotted names for nested maps: "authority.emsal", "statusPenalty.bozuldu". Unknown keys and non finite values
 * are ignored, so a bad row cannot break ranking.
 */
export function fromFlatWeights(
  flat: Record<string, number>,
  base: RankingWeights = DEFAULT_WEIGHTS,
): RankingWeights {
  const out: RankingWeights = {
    ...base,
    authority: { ...base.authority },
    statusPenalty: { ...base.statusPenalty },
  };
  for (const [k, v] of Object.entries(flat)) {
    if (!Number.isFinite(v)) continue;
    const [head, sub] = k.split('.');
    if (head === 'authority' && sub && sub in out.authority) out.authority[sub as AuthorityClass] = v;
    else if (head === 'statusPenalty' && sub) out.statusPenalty[sub as RecordStatus] = v;
    else if (
      !sub &&
      head &&
      head in out &&
      typeof (out as unknown as Record<string, unknown>)[head] === 'number'
    )
      (out as unknown as Record<string, number>)[head] = v;
  }
  return out;
}
