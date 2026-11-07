import type { AuthorityClass, RecordStatus, RecordType } from '@kazuist/contracts';
import { normalize } from './normalize.ts';

export interface AuthorityInput {
  type: RecordType;
  court: string | null;
  chamber: string | null;
  status?: RecordStatus;
  jurisdiction?: string;
  /** AYM: norm denetimi or bireysel başvuru, when the source says so. */
  aymKind?: 'norm_denetimi' | 'bireysel_basvuru' | null;
}

/**
 * Rule based authority class (plan Ek F). The table is not used in production before editor approval; the
 * editor confirmation is records.authority_confirmed. Repealed norms fall out of "bağlayıcı norm".
 */
export function classifyAuthority(r: AuthorityInput): AuthorityClass {
  const court = normalize(r.court ?? '');
  const chamber = normalize(r.chamber ?? '');
  if (r.type === 'makale' || r.type === 'kitap' || r.type === 'tez') return 'doktrin';
  if (r.type === 'ab_hukuku' || (r.jurisdiction && !['TR', 'AİHS'].includes(r.jurisdiction)))
    return 'karsilastirmali';
  if (r.type === 'kurul_karari') return 'idari_karar';
  if (r.type === 'mevzuat') return r.status === 'yururlukten_kalkti' ? 'emsal_sinirli' : 'baglayici_norm';
  // Court decisions.
  if (court.includes('uyuşmazlık mahkemesi')) return 'baglayici_karar';
  if (court.includes('anayasa mahkemesi')) {
    if (r.aymKind === 'norm_denetimi') return 'baglayici_karar';
    return 'yuksek_emsal';
  }
  if (court.includes('avrupa insan hakları mahkemesi')) return 'yuksek_emsal';
  if (court.includes('yargıtay') || court.includes('danıştay')) {
    if (/içtihad[ıi] birleştirme|içtihatları birleştirme/.test(chamber)) return 'baglayici_karar';
    if (/(hukuk|ceza) genel kurulu|idari dava daireleri kurulu|vergi dava daireleri kurulu/.test(chamber))
      return 'yuksek_emsal';
    return 'emsal';
  }
  if (
    /bölge adliye|bölge idare|asliye|sulh|ağır ceza|idare mahkemesi|vergi mahkemesi|iş mahkemesi/.test(court)
  )
    return 'emsal_sinirli';
  return 'emsal_sinirli';
}

/** Binding classes for Ek D rule 6 and plan 7.4/6 ("destekleyici kaynak" otherwise). */
export const BINDING: ReadonlySet<AuthorityClass> = new Set(['baglayici_norm', 'baglayici_karar']);
export const isBinding = (a: AuthorityClass): boolean => BINDING.has(a);
