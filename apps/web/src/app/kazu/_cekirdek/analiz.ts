/**
 * Reads the /kazu draft for the Kazu panel: the outline, words per section, open "support to be added" notes
 * and the automatic part of the pre-submission check (docs/kazu/danismanlik-ilkeleri.md, interaction 6).
 * Pure functions over the editor's ProseMirror JSON, so they run in tests without a browser.
 */

export interface PmDugum {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmDugum[];
  text?: string;
}

export interface Bolum {
  baslik: string;
  seviye: number;
  kelime: number;
  not: number;
}

export interface KaynakNotu {
  eser: string;
  yer: string;
  iddia: string;
  tur: 'asil' | 'ikincil';
}

export interface Vaka {
  tur: string;
  mevcut: string;
  oneri: string;
  fark: string;
  kabul: string;
}

export interface Calisma {
  iddia: { sorun: string; cevap: string; yakin: string; katki: string };
  kaynaklar: KaynakNotu[];
  vakalar: Vaka[];
  itiraz: string;
  cevap: string;
  tur: number;
  isaret: Record<string, boolean>;
}

export const BOS_CALISMA: Calisma = {
  iddia: { sorun: '', cevap: '', yakin: '', katki: '' },
  kaynaklar: [],
  vakalar: [],
  itiraz: '',
  cevap: '',
  tur: 1,
  isaret: {},
};

/** Notes the writer leaves for later ("buraya dayanak eklenecek", "kaynak aranacak"), matched loosely. */
const NOT = /dayanak eklenecek|kaynak aranacak|\[\[[^\]]*\]\]/giu;

const metin = (d: PmDugum): string =>
  d.type === 'text' ? (d.text ?? '') : (d.content ?? []).map(metin).join(d.type === 'paragraph' ? '' : ' ');
const kelimeSay = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Sections in order: text before the first heading counts as an untitled opening section. */
export function bolumler(govde: PmDugum | null | undefined): Bolum[] {
  const out: Bolum[] = [];
  let simdiki: Bolum | null = null;
  for (const d of govde?.content ?? []) {
    if (d.type === 'heading') {
      simdiki = { baslik: metin(d).trim(), seviye: Number(d.attrs?.level ?? 2), kelime: 0, not: 0 };
      out.push(simdiki);
      continue;
    }
    const m = metin(d);
    if (!simdiki) {
      if (!m.trim()) continue;
      simdiki = { baslik: '', seviye: 2, kelime: 0, not: 0 };
      out.push(simdiki);
    }
    simdiki.kelime += kelimeSay(m);
    simdiki.not += (m.match(NOT) ?? []).length;
  }
  return out;
}

export type KontrolDurumu = 'tamam' | 'eksik';
export interface Kontrol {
  id: string;
  durum: KontrolDurumu;
  sayi?: number;
}

const sec = (b: Bolum[], ad: string) =>
  b.find((x) => x.baslik.toLocaleLowerCase('tr-TR') === ad.toLocaleLowerCase('tr-TR'));

/** The automatic checks; the reader-only checks are ticked by hand in the panel. */
export function otomatikKontroller(govde: PmDugum | null | undefined, baslik: string, c: Calisma): Kontrol[] {
  const b = bolumler(govde);
  const notlar = b.reduce((t, x) => t + x.not, 0);
  const bosBolum = b.filter(
    (x) => x.baslik && x.kelime === 0 && x.baslik.toLocaleLowerCase('tr-TR') !== 'kaynakça',
  );
  const ozet = sec(b, 'Özet');
  const sonuc = sec(b, 'Sonuç');
  const iddiaDolu = Object.values(c.iddia).every((v) => v.trim().length > 0);
  const yersiz = c.kaynaklar.filter((k) => k.eser.trim() && !k.yer.trim()).length;
  return [
    { id: 'baslik', durum: baslik.trim() ? 'tamam' : 'eksik' },
    { id: 'iddia', durum: iddiaDolu ? 'tamam' : 'eksik' },
    { id: 'ozet', durum: !ozet || ozet.kelime > 0 ? 'tamam' : 'eksik' },
    { id: 'sonuc', durum: !sonuc || sonuc.kelime > 0 ? 'tamam' : 'eksik' },
    { id: 'bosBolum', durum: bosBolum.length ? 'eksik' : 'tamam', sayi: bosBolum.length },
    { id: 'not', durum: notlar ? 'eksik' : 'tamam', sayi: notlar },
    { id: 'kaynakYer', durum: yersiz ? 'eksik' : 'tamam', sayi: yersiz },
  ];
}
