import type { SablonTuru } from './kural-semasi.ts';

const HARITA: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  i: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ł: 'l',
};

/**
 * Turkish letters to ASCII, lower case, words joined by single hyphens (plan 10.5/4). "İ" is lowered with
 * the Turkish rule first, so "İSTANBUL" gives "istanbul" and not "i̇stanbul".
 */
export function asciiSlug(metin: string, azami = 60): string {
  const kucuk = metin.toLocaleLowerCase('tr-TR').normalize('NFC');
  let cikti = '';
  for (const ch of kucuk) {
    const m = HARITA[ch];
    if (m !== undefined) cikti += m;
    else {
      // Strip remaining accents (e.g. é) through decomposition; anything non-alphanumeric becomes a hyphen.
      const duz = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      cikti += /^[a-z0-9]$/.test(duz) ? duz : '-';
    }
  }
  const slug = cikti.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug.slice(0, azami).replace(/-$/, '');
}

/** `Tez_Sablonu_<kurum>.docx` and `Makale_Sablonu_<dergi>.docx` (SRS 6.3 and 6.5); ASCII only. */
export function sablonDosyaAdi(tur: SablonTuru, ad: string): string {
  const onEk = tur === 'tez' ? 'Tez_Sablonu' : 'Makale_Sablonu';
  const govde = asciiSlug(ad) || 'genel';
  return `${onEk}_${govde}.docx`;
}
