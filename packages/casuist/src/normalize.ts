/**
 * Turkish normalisation (plan 7.1/4 and Ek D.2). Pure and browser safe: the line validator runs the same
 * code in the browser (BYOK istemci) and on the server.
 */

/** Character class from code points, so the source holds no invisible or look-alike characters. */
const cls = (...cps: number[]): RegExp => new RegExp('[' + String.fromCodePoint(...cps) + ']', 'gu');

/** Typographic single quotes, prime, modifier apostrophe, grave and acute accents. */
const SINGLE_QUOTES = cls(0x2018, 0x2019, 0x201a, 0x201b, 0x2032, 0x02bc, 0x60, 0xb4);
/** Typographic double quotes, double prime and guillemets. */
const DOUBLE_QUOTES = cls(0x201c, 0x201d, 0x201e, 0x201f, 0x2033, 0xab, 0xbb);
/** Hyphen, non-breaking hyphen, figure dash, en dash, em dash and minus sign fold to the ASCII hyphen. */
const DASHES = cls(0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212);
const SOFT_HYPHEN = cls(0xad);
/** Zero width space, non-joiner, joiner, word joiner and byte order mark. */
const ZERO_WIDTH = cls(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff);

/**
 * Ek D.2 normalize(s): NFC; tr-TR lower case (İ to i, I to ı); quote and apostrophe variants unified;
 * soft hyphen removed; whitespace collapsed. Dash variants are unified as well, so an en dash in "11/1-c" matches.
 */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .replace(SOFT_HYPHEN, '')
    .replace(ZERO_WIDTH, '')
    .toLocaleLowerCase('tr-TR')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const ASCII_FOLD: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

/** normalize plus Turkish letters folded to ASCII, so "ozel nitelikli" finds "özel nitelikli". */
export function fold(s: string): string {
  return normalize(s).replace(/[çğıöşüâîû]/g, (c) => ASCII_FOLD[c] ?? c);
}

/** Drops the inflection after an apostrophe: "KVKK'nın" -> "KVKK", "Yargıtay'ın" -> "Yargıtay". */
export function stripApostropheSuffix(s: string): string {
  return s.replace(/(\p{L}|\d)'[\p{Ll}]{1,6}(?![\p{L}])/gu, '$1');
}

/**
 * Prefix stemming for Turkish retrieval: the first five letters of a word (the "F5" truncation known to work
 * well for Turkish information retrieval). Numbers and short words stay whole.
 */
export function stem(token: string): string {
  if (/^\d/.test(token) || token.length <= 5) return token;
  return token.slice(0, 5);
}

/** Lower case words with Turkish letters kept (for the PostgreSQL "turkish" configuration). */
export function words(s: string): string[] {
  return stripApostropheSuffix(normalize(s))
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 || /^\d$/.test(t));
}

/** Search tokens: folded, apostrophe suffixes dropped, split on anything that is not a letter or digit. */
export function tokens(s: string): string[] {
  return fold(stripApostropheSuffix(normalize(s)))
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 || /^\d$/.test(t));
}

/** Stemmed search terms, stop words removed. */
export function terms(s: string): string[] {
  return tokens(s)
    .filter((t) => !STOP.has(t))
    .map(stem);
}

/** Small Turkish and English stop list for the in-memory index (folded forms). */
export const STOP = new Set([
  've',
  'veya',
  'ile',
  'bir',
  'bu',
  'su',
  'da',
  'de',
  'mi',
  'mu',
  'ne',
  'icin',
  'gibi',
  'olan',
  'olarak',
  'ise',
  'ki',
  'hangi',
  'nedir',
  'nasil',
  'midir',
  'mudur',
  'var',
  'yok',
  'en',
  'cok',
  'daha',
  'ya',
  'hem',
  'the',
  'of',
  'and',
  'or',
  'to',
  'in',
  'is',
  'what',
  'which',
  'how',
  'a',
  'an',
]);

/** Word count used by the 70 word limit (Ek D.2/f): runs of letters or digits. */
export function wordCount(s: string): number {
  return (s.match(/[\p{L}\p{N}]+(?:[.'/-][\p{L}\p{N}]+)*/gu) ?? []).length;
}
