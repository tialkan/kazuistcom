/**
 * Source verification helpers for card quotes (plan 10.6/4, FR-62). Pure functions: the network part lives in
 * content/desteler/dogrula.ts. A card is source-verified when its quotation appears word for word in the text of
 * the cited article as published by the Mevzuat Bilgi Sistemi; nothing here guesses an article number or a date.
 */
import { createHash } from 'node:crypto';

const HTML_VARLIKLARI: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ccedil: 'ç',
  Ccedil: 'Ç',
  ouml: 'ö',
  Ouml: 'Ö',
  uuml: 'ü',
  Uuml: 'Ü',
  acirc: 'â',
  Acirc: 'Â',
  icirc: 'î',
  Icirc: 'Î',
  ucirc: 'û',
  Ucirc: 'Û',
  ecirc: 'ê',
  ocirc: 'ô',
  laquo: '«',
  raquo: '»',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '…',
  ldquo: '\u201C',
  rdquo: '\u201D',
  lsquo: '\u2018',
  rsquo: '\u2019',
  sect: '§',
  deg: '°',
  ordm: 'º',
};

/** Page HTML to flat text: scripts and styles dropped, tags become spaces, entities decoded, spaces collapsed. */
export function htmlMetne(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tam, kod: string) => {
      if (kod.startsWith('#x')) return String.fromCodePoint(parseInt(kod.slice(2), 16));
      if (kod.startsWith('#')) return String.fromCodePoint(parseInt(kod.slice(1), 10));
      return HTML_VARLIKLARI[kod] ?? HTML_VARLIKLARI[kod.toLowerCase()] ?? tam;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Comparison form: Turkish lower case, typographic quotes and dashes unified, spaces collapsed. Letters keep their
 * diacritics, so "Medenî" and "Medeni" stay different on purpose (a quote must be exact).
 */
const kodlar = (...k: number[]) => k.map((c) => String.fromCharCode(c)).join('');
/** Typographic quotes (single, double) and the hyphen, en dash, em dash and minus sign, built from code points. */
const TEK_TIRNAK = new RegExp(`[${kodlar(0x2018, 0x2019, 0x201a, 0x201b, 0x2032)}]`, 'g');
const CIFT_TIRNAK = new RegExp(`[${kodlar(0x201c, 0x201d, 0x201e, 0x201f, 0x2033)}]`, 'g');
const CIZGI_SINIFI = kodlar(0x2013, 0x2014, 0x2212);
const CIZGILER = new RegExp(`[${CIZGI_SINIFI}]`, 'g');

export function karsilastirmaBicimi(s: string): string {
  return s
    .replace(TEK_TIRNAK, "'")
    .replace(CIFT_TIRNAK, '"')
    .replace(CIZGILER, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

export interface MaddeAraligi {
  /** Article label as printed, e.g. "11", "11/A". */
  no: string;
  baslangic: number;
  bitis: number;
}

/** "Madde 11 -", "MADDE 11-", "Ek Madde 3 -", "GEÇİCİ MADDE 1-" (hyphen, en dash or em dash after the number). */
const BASLIK = new RegExp(
  '(?:^|[\\s.;:)])(?:(?:ek|ge[çÇ][iİıI]c[iİıI])\\s+)?madde\\s+(\\d+(?:\\/[A-Za-zÇĞİÖŞÜçğıöşü])?)\\s*[-' +
    kodlar(0x2013, 0x2014) +
    ']',
  'giu',
);

/** Locate every "Madde N -" heading of a law text. Ek and Geçici articles are labelled "ek-N" and "gecici-N". */
export function maddeleriBul(metin: string): MaddeAraligi[] {
  const bulunanlar: { no: string; baslangic: number; onEk: string }[] = [];
  for (const m of metin.matchAll(BASLIK)) {
    const bas = (m.index ?? 0) + (m[0].length - m[0].trimStart().length);
    const govde = m[0].trimStart().replace(/^[.;:)]\s*/, '');
    const onEk = /^(ek|geçici)\s/u.exec(govde.toLocaleLowerCase('tr-TR'))?.[1];
    bulunanlar.push({
      no: m[1] as string,
      baslangic: bas,
      onEk: onEk === 'ek' ? 'ek-' : onEk ? 'gecici-' : '',
    });
  }
  return bulunanlar.map((b, i) => ({
    no: `${b.onEk}${b.no}`,
    baslangic: b.baslangic,
    bitis: bulunanlar[i + 1]?.baslangic ?? metin.length,
  }));
}

/** Text of the (ordinary) article `no`; null when the law text has no such article. */
export function maddeMetni(metin: string, no: string): string | null {
  const m = maddeleriBul(metin).find((x) => x.no === no);
  return m ? metin.slice(m.baslangic, m.bitis).trim() : null;
}

/** True when `alinti` appears in `madde` word for word (after the comparison form). */
export function alintiVarMi(madde: string, alinti: string): boolean {
  const a = karsilastirmaBicimi(alinti);
  return a.length >= 12 && karsilastirmaBicimi(madde).includes(a);
}

/** Fingerprint of an article; when the published text changes, the fingerprint changes and cards go back to review. */
export function maddeOzeti(madde: string): string {
  return createHash('sha256').update(karsilastirmaBicimi(madde)).digest('hex').slice(0, 16);
}

export interface Kunye {
  kanunNo: string | null;
  kabulTarihi: string | null;
  resmiGazeteTarihi: string | null;
  resmiGazeteSayisi: string | null;
  ad: string | null;
}

const gunAy = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const isoTarih = (s: string | undefined) => {
  const m = s ? gunAy.exec(s) : null;
  return m ? `${m[3]}-${(m[2] as string).padStart(2, '0')}-${(m[1] as string).padStart(2, '0')}` : null;
};

/** Reads the header block of a mevzuat page text ("Kanun Numarası", "Kabul Tarihi", Resmî Gazete). */
export function kunyeCikar(metin: string): Kunye {
  const al = (re: RegExp) => re.exec(metin)?.[1]?.trim();
  return {
    kanunNo: al(/Kanun Numarası\s*:\s*(\d+)/) ?? null,
    kabulTarihi: isoTarih(al(/Kabul Tarihi\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/)),
    resmiGazeteTarihi: isoTarih(al(/Yayımlandığı Resmî Gazete\s*:\s*Tarihi:\s*(\d{1,2}\/\d{1,2}\/\d{4})/)),
    resmiGazeteSayisi:
      al(/Yayımlandığı Resmî Gazete\s*:\s*Tarihi:\s*\d{1,2}\/\d{1,2}\/\d{4}\s*Sayı:\s*(\d+)/) ?? null,
    ad: al(/^\s*([A-ZÇĞİÖŞÜ0-9 ,.'-]{6,}?)\s+Kanun Numarası/) ?? null,
  };
}

/** Address of the Mevzuat Bilgi Sistemi page of a law (the text page the connector reads, docs/kaynaklar/mevzuat.md). */
export function mevzuatAdresi(tur: number, no: string, tertip: number | string): string {
  return `https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=${no}&MevzuatTur=${tur}&MevzuatTertip=${tertip}`;
}

/** The text-only frame of the same law; this is what dogrula.ts downloads. */
export function mevzuatMetinAdresi(tur: number, no: string, tertip: number | string): string {
  return `https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=${tur}&MevzuatNo=${no}&MevzuatTertip=${tertip}`;
}
