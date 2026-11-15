/**
 * Quantities for the number rule of the line validator (Ek D.2/c): a number written in words with a unit
 * ("on beş gün", "iki yıl", "yüzde yirmi") must be backed by a cited passage just like "15 gün". Pure and browser
 * safe. Input is expected in normalize() form (tr-TR lower case).
 */

const ONES: Record<string, number> = {
  bir: 1,
  iki: 2,
  üç: 3,
  dört: 4,
  beş: 5,
  altı: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
};
const TENS: Record<string, number> = {
  on: 10,
  yirmi: 20,
  otuz: 30,
  kırk: 40,
  elli: 50,
  altmış: 60,
  yetmiş: 70,
  seksen: 80,
  doksan: 90,
};
const SCALES: Record<string, number> = { yüz: 100, bin: 1000, milyon: 1_000_000, milyar: 1_000_000_000 };
const NUMBER_WORDS = [...Object.keys(ONES), ...Object.keys(TENS), ...Object.keys(SCALES)].sort(
  (a, b) => b.length - a.length,
);

/**
 * Unit words after a number. Each pattern matches a whole word: the stem plus the inflections that keep the
 * meaning ("günlük", "yıldan", "aya"), but not look-alike words ("güncel", "ayrı", "aynı", "kişisel").
 */
const UNITS: readonly (readonly [string, RegExp])[] = [
  ['gün', /^gün(?:$|[üeadl'])/u],
  ['hafta', /^hafta(?:$|[lydn'])/u],
  ['ay', /^ay(?:$|[aıdl'])/u],
  ['yıl', /^yıl(?:$|[ıadl'])/u],
  ['yıl', /^sene(?:$|[yldn'])/u],
  ['saat', /^saat(?:$|[ietl'])/u],
  ['dakika', /^dakika(?:$|[yldn'])/u],
  ['saniye', /^saniye(?:$|[yldn'])/u],
  ['yaş', /^yaş(?:$|[ıadl'])/u],
  ['kat', /^kat(?:ı|ına|ını|ında)?$/u],
  ['misli', /^misl[ie]/u],
  ['kez', /^(?:kez|defa|kere)(?:$|[ld'])/u],
  ['lira', /^(?:lira|tl)(?:$|[ldy'])/u],
  ['kuruş', /^kuruş/u],
  ['avro', /^(?:avro|euro)/u],
  ['dolar', /^dolar/u],
  ['kişi', /^kişi(?:$|[yldn'])/u],
  ['adet', /^adet/u],
  ['metre', /^metre(?:$|[ldyk'])/u],
  ['kilometre', /^kilometre/u],
  ['kilogram', /^kilogram/u],
  ['gram', /^gram(?:$|[ıl'])/u],
  ['hektar', /^hektar/u],
  ['dönüm', /^dönüm/u],
];

export interface Quantity {
  value: number;
  unit: string;
  /** Written with digits ("15") or with words ("on beş"). */
  form: 'rakam' | 'yazi';
  /** The words or digits as they appear (normalised). */
  text: string;
}

/** Splits a run such as "onbeş" or "ikiyüzelli" into number words; null when it is not made of them only. */
function segmentNumberWord(token: string): string[] | null {
  if (token in ONES || token in TENS || token in SCALES) return [token];
  const out: string[] = [];
  let rest = token;
  while (rest) {
    const w = NUMBER_WORDS.find((n) => rest.startsWith(n));
    if (!w) return null;
    out.push(w);
    rest = rest.slice(w.length);
  }
  return out.length >= 2 ? out : null;
}

/** Value of Turkish number words in order: "iki yüz elli bin" = 250000. */
export function numberWordsValue(words: readonly string[]): number {
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (w in ONES) current += ONES[w] ?? 0;
    else if (w in TENS) current += TENS[w] ?? 0;
    else if (w === 'yüz') current = (current || 1) * 100;
    else {
      total += (current || 1) * (SCALES[w] ?? 1);
      current = 0;
    }
  }
  return total + current;
}

/** "1.000" and "15" to numbers; "2,5" to 2.5. */
function digitValue(token: string): number | null {
  const plain = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(token) ? token.replace(/\./g, '') : token;
  if (!/^\d+(?:,\d+)?$/.test(plain)) return null;
  return Number(plain.replace(',', '.'));
}

interface Tok {
  text: string;
  /** Letters only, apostrophe suffix dropped ("tl'lik" to "tl"). */
  bare: string;
  digits: boolean;
}

function tokenize(normalized: string): Tok[] {
  const out: Tok[] = [];
  for (const m of normalized.matchAll(/%|[\p{L}]+(?:'[\p{L}]+)?|\d+(?:[.,]\d+)*/gu)) {
    const text = m[0];
    out.push({ text, bare: text.split("'")[0] ?? text, digits: /^\d/.test(text) });
  }
  return out;
}

function unitOf(toks: readonly Tok[], i: number): string | null {
  const t = toks[i];
  if (!t || t.digits) return null;
  // "on iş günü" is a different period from "on gün".
  if (t.bare === 'iş' && toks[i + 1] && /^gün/u.test(toks[i + 1]?.bare ?? '')) return 'iş günü';
  for (const [unit, re] of UNITS) if (re.test(t.text)) return unit;
  return null;
}

/**
 * Quantities in normalised text: number words or digits followed by a unit word, and percentages ("yüzde on beş",
 * "%15", "yüzde 15"). A number word without a unit is not taken ("bir karar" is an article, not a number).
 */
export function quantities(normalized: string): Quantity[] {
  const toks = tokenize(normalized);
  const out: Quantity[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] as Tok;
    const percent = toks[i - 1]?.bare === 'yüzde' || toks[i - 1]?.text === '%';
    if (t.digits) {
      const value = digitValue(t.text);
      if (value === null) continue;
      const unit = percent ? '%' : unitOf(toks, i + 1);
      if (unit) out.push({ value, unit, form: 'rakam', text: t.text });
      continue;
    }
    const first = segmentNumberWord(t.text);
    if (!first) continue;
    const words = [...first];
    let j = i + 1;
    for (; j < toks.length; j++) {
      const seg = segmentNumberWord(toks[j]?.text ?? '');
      if (!seg) break;
      words.push(...seg);
    }
    const unit = percent ? '%' : unitOf(toks, j);
    if (unit) {
      out.push({
        value: numberWordsValue(words),
        unit,
        form: 'yazi',
        text: toks
          .slice(i, j)
          .map((x) => x.text)
          .join(' '),
      });
    }
    i = j - 1;
  }
  return out;
}

/** True when `q` (from a sentence) is backed by one of the cited quantities: same value and unit. */
export function quantityBacked(q: Quantity, cited: readonly Quantity[]): boolean {
  return cited.some((c) => c.value === q.value && c.unit === q.unit);
}
