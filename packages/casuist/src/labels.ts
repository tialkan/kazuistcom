import { DEFAULT_THRESHOLDS, type LabelThresholds } from './scoring.ts';
import type { CorpusRecord, Label } from './types.ts';

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const ONCU_CHAMBER = /genel kurul|içtihad[ıi] birleştirme|içtihatları birleştirme|büyük daire/i;

export type AgeLabel = 'yeni' | 'yerlesik' | 'eski';

/** SRS 3.3: Yeni (last 3 years), Yerleşik (3 to 10 years), Eski (older; "hâlâ geçerli mi" warning in the UI). */
export function ageLabel(
  date: string | null,
  now: Date,
  t: LabelThresholds = DEFAULT_THRESHOLDS,
): AgeLabel | null {
  if (!date) return null;
  const at = Date.parse(date);
  if (!Number.isFinite(at)) return null;
  const years = (now.getTime() - at) / YEAR_MS;
  if (years <= t.yeniYil) return 'yeni';
  if (years <= t.yerlesikYil) return 'yerlesik';
  return 'eski';
}

/** SRS 3.3 Öncü: general assembly, unification, grand chamber, AYM norm review, or a citation count threshold. */
export function isOncu(r: CorpusRecord, t: LabelThresholds = DEFAULT_THRESHOLDS): boolean {
  if (r.chamber && ONCU_CHAMBER.test(r.chamber)) return true;
  if (r.authorityClass === 'baglayici_karar') return true;
  if ((r.citedByCount ?? 0) >= t.oncuAtif) return true;
  return r.type !== 'mevzuat' && (r.openalexCitedBy ?? 0) >= t.oncuOpenalex;
}

/** True when the record's data day is older than the threshold (Veri günü label, Ek D.2/e). */
export function staleData(fetchedAt: string | null | undefined, now: Date, days: number): boolean {
  if (!fetchedAt) return true;
  const at = Date.parse(fetchedAt);
  return !Number.isFinite(at) || now.getTime() - at > days * DAY_MS;
}

export function relevanceLabel(rel: number, t: LabelThresholds = DEFAULT_THRESHOLDS): Label {
  if (rel >= t.yuksek) return 'ilgililik_yuksek';
  if (rel >= t.orta) return 'ilgililik_orta';
  return 'ilgililik_arka_plan';
}

/**
 * Labels of plan 7.3 in a fixed display order: age, Öncü, Anonimleştirildi, İlgililik, Güncellik uyarısı,
 * Canlı kaynak, Veri günü. The authority class is a field of its own (FR-81), not a label.
 */
export function computeLabels(
  r: CorpusRecord,
  rel: number | null,
  now: Date,
  t: LabelThresholds = DEFAULT_THRESHOLDS,
): Label[] {
  const out: Label[] = [];
  const age = ageLabel(r.date, now, t);
  if (age) out.push(age);
  if (isOncu(r, t)) out.push('oncu');
  if (r.anonymized) out.push('anonimlestirildi');
  if (rel !== null) out.push(relevanceLabel(rel, t));
  if (r.status === 'degisti' || r.status === 'yururlukten_kalkti' || r.status === 'bozuldu')
    out.push('guncellik_uyarisi');
  if (r.liveOnly) out.push('canli_kaynak');
  if (staleData(r.fetchedAt, now, t.veriGunuGun)) out.push('veri_gunu');
  return out;
}
