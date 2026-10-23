/**
 * Personal data scrubber (plan 8.5, structural recognisers of 6.4/1 and Ek E masks).
 * The mapping from label to original value lives only in the returned object (request memory).
 */

export interface NameSpan {
  start: number;
  end: number;
}

/** Pluggable person name recogniser (NER). Implementations must not log the text. */
export interface NameRecognizer {
  find(text: string): Promise<NameSpan[]> | NameSpan[];
}

export interface ScrubResult {
  text: string;
  /** Label to original value; keep in request memory only, never persist or log. */
  mapping: Map<string, string>;
  counts: Record<string, number>;
}

/** Separators people type inside numbers: whitespace (incl. line breaks), dot, dash. */
const stripSeparators = (s: string): string => s.replace(/[\s.-]/g, '');

export function isValidTckn(raw: string): boolean {
  const s = stripSeparators(raw);
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = [...s].map(Number) as number[];
  const at = (i: number): number => d[i] ?? 0;
  const odd = at(0) + at(2) + at(4) + at(6) + at(8);
  const even = at(1) + at(3) + at(5) + at(7);
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== at(9)) return false;
  const sum = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return sum % 10 === at(10);
}

export function isValidIban(raw: string): boolean {
  const s = stripSeparators(raw).toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  if (s.startsWith('TR') && s.length !== 26) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const c of v) rem = (rem * 10 + Number(c)) % 97;
  }
  return rem === 1;
}

export function isValidLuhn(raw: string): boolean {
  const s = stripSeparators(raw);
  if (!/^\d{13,19}$/.test(s)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = Number(s[i]);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

interface Rule {
  kind: string;
  label: string;
  numbered: boolean;
  re: RegExp;
  check?: (m: string) => boolean;
}

const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
/** At most one separator between digit groups (quality gate O-03); checksums guard false positives. */
const S = '(?:[ \\t.\\-]|\\r?\\n)?';

// Order matters: longer and checksummed identifiers first.
const RULES: Rule[] = [
  {
    kind: 'email',
    label: 'E-POSTA',
    numbered: true,
    re: new RegExp(`${B}[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}.-]+\\.[\\p{L}]{2,}${E}`, 'gu'),
  },
  {
    kind: 'iban',
    label: 'IBAN',
    numbered: true,
    re: new RegExp(`${B}[A-Za-z]{2}\\d{2}(?:${S}[A-Za-z0-9]{4}){3,7}(?:${S}[A-Za-z0-9]{1,4})?${E}`, 'gu'),
    check: isValidIban,
  },
  {
    kind: 'kart',
    label: 'KART',
    numbered: true,
    re: new RegExp(`${B}\\d{4}(?:${S}\\d{4}){2}${S}\\d{1,7}${E}`, 'gu'),
    check: isValidLuhn,
  },
  {
    kind: 'tckn',
    label: 'KİMLİK NO',
    numbered: true,
    re: new RegExp(`${B}[1-9](?:${S}\\d){10}${E}`, 'gu'),
    check: isValidTckn,
  },
  {
    kind: 'telefon',
    label: 'TELEFON',
    numbered: true,
    re: new RegExp(`${B}(?:\\+90${S}|0)?\\(?5\\d{2}\\)?${S}\\d{3}${S}\\d{2}${S}\\d{2}${E}`, 'gu'),
  },
  {
    kind: 'telefon',
    label: 'TELEFON',
    numbered: true,
    re: new RegExp(`${B}(?:\\+90${S}|0)\\(?[2-4]\\d{2}\\)?${S}\\d{3}${S}\\d{2}${S}\\d{2}${E}`, 'gu'),
  },
  {
    kind: 'plaka',
    label: 'PLAKA',
    numbered: true,
    // Turkish plate: province 01..81, 1..3 letters, 2..4 digits.
    re: new RegExp(`${B}(?:0[1-9]|[1-7]\\d|8[01]) ?[A-Z]{1,3} ?\\d{2,4}${E}`, 'gu'),
  },
];

/**
 * Masks structural identifiers and person names. Repeated values reuse the same label, so
 * [KİŞİ-1] always means the same person within one request.
 */
export async function scrub(text: string, ner?: NameRecognizer): Promise<ScrubResult> {
  const mapping = new Map<string, string>();
  const reverse = new Map<string, string>();
  const counters: Record<string, number> = {};
  const counts: Record<string, number> = {};
  const labelFor = (label: string, kind: string, value: string): string => {
    const key = `${label}\u0000${value}`;
    const existing = reverse.get(key);
    counts[kind] = (counts[kind] ?? 0) + 1;
    if (existing) return existing;
    const n = (counters[label] = (counters[label] ?? 0) + 1);
    const tag = `[${label}-${n}]`;
    mapping.set(tag, value);
    reverse.set(key, tag);
    return tag;
  };

  let out = text;
  if (ner) {
    const spans = [...(await ner.find(out))]
      .filter((s) => s.start >= 0 && s.end <= out.length && s.end > s.start)
      .sort((a, b) => b.start - a.start);
    // Assign numbers in reading order, replace from the end.
    const ordered = [...spans].sort((a, b) => a.start - b.start);
    const tags = new Map<NameSpan, string>();
    for (const s of ordered) tags.set(s, labelFor('KİŞİ', 'kisi', out.slice(s.start, s.end)));
    let last = Number.POSITIVE_INFINITY;
    for (const s of spans) {
      if (s.end > last) continue;
      out = out.slice(0, s.start) + (tags.get(s) ?? '') + out.slice(s.end);
      last = s.start;
    }
  }
  for (const rule of RULES) {
    out = out.replace(rule.re, (m) => {
      if (rule.check && !rule.check(m)) return m;
      return labelFor(rule.label, rule.kind, m);
    });
  }
  return { text: out, mapping, counts };
}

/** Puts original values back into model output, for display to the same user only. */
export function restore(text: string, mapping: ReadonlyMap<string, string>): string {
  return text.replace(/\[[^\]\n]{1,24}-\d+\]/gu, (tag) => mapping.get(tag) ?? tag);
}
