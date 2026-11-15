import type { RecordType } from '@kazuist/contracts';
import type { Chunk } from './types.ts';

export interface ChunkOptions {
  /** Target passage size in characters. */
  max?: number;
  /** Passages shorter than this are merged with the next paragraph. */
  min?: number;
  /**
   * Label decision sections (plan 6.3 chunks.bölüm). A recognised heading always starts a new passage, so a
   * passage never spans two sections. Use `sectionsFor(type)`; statutes and doctrine are not sectioned.
   */
  sections?: boolean;
}

/**
 * Sections of a court or board decision (chunks.section):
 * - iddia: claims and defences of the parties, requests, grounds of appeal (dava, cevap, istem, temyiz sebepleri);
 * - surec: procedural history, facts and the views of others (ilk derece and istinaf kararları, raportör görüşü);
 * - gerekce: the court's own reasoning;
 * - hukum: the operative part (hüküm, karar, sonuç);
 * - karsi_oy: separate opinions (karşı oy, muhalefet şerhi, ek or değişik gerekçe).
 * Passages from iddia, surec and karsi_oy never make a sentence "binding" on their own (plan 7.4/6).
 */
export type ChunkSection = 'iddia' | 'surec' | 'gerekce' | 'hukum' | 'karsi_oy';
export const CHUNK_SECTIONS: readonly ChunkSection[] = ['iddia', 'surec', 'gerekce', 'hukum', 'karsi_oy'];

/** Sections that state what someone other than the deciding body said or did. */
export const NON_BINDING_SECTIONS: ReadonlySet<string> = new Set<ChunkSection>([
  'iddia',
  'surec',
  'karsi_oy',
]);

/** Record types whose text is cut along decision sections. */
export const SECTIONED_TYPES: ReadonlySet<RecordType> = new Set<RecordType>(['karar', 'kurul_karari']);

export const sectionsFor = (type: RecordType): boolean => SECTIONED_TYPES.has(type);

/**
 * Headings as published (upper case, Turkish letters). services/worker-py/nlp/chunk.py holds the same table;
 * fixtures/parcalar.json pins the behaviour for both sides. Longer headings are tried first.
 */
export const SECTION_HEADINGS: readonly (readonly [ChunkSection, readonly string[]])[] = [
  [
    'karsi_oy',
    [
      'KARŞI OY',
      'KARŞIOY',
      'KARŞI OY GEREKÇESİ',
      'KARŞI OY YAZISI',
      'MUHALEFET ŞERHİ',
      'AZLIK OYU',
      'AZLIK GÖRÜŞÜ',
      'AYRIŞIK OY',
      'FARKLI GEREKÇE',
      'DEĞİŞİK GEREKÇE',
      'EK GEREKÇE',
      'KARŞI GÖRÜŞ',
    ],
  ],
  [
    'iddia',
    [
      'DAVA',
      'DAVACI İSTEMİ',
      'DAVACININ İSTEMİ',
      'DAVACI İDDİASI',
      'DAVACININ İDDİALARI',
      'DAVACI İDDİALARI',
      'İDDİA',
      'İDDİALAR',
      'İDDİALARIN ÖZETİ',
      'İSTEM',
      'İSTEMİN ÖZETİ',
      'İSTEMİN KONUSU',
      'CEVAP',
      'DAVALI CEVABI',
      'DAVALININ CEVABI',
      'SAVUNMA',
      'SAVUNMANIN ÖZETİ',
      'TARAFLARIN İDDİA VE SAVUNMALARI',
      'TEMYİZ SEBEPLERİ',
      'TEMYİZ İSTEMİ',
      'TEMYİZ YOLUNA BAŞVURANLAR',
      'BAŞVURUNUN KONUSU',
      'BAŞVURUCUNUN İDDİALARI',
      'İPTAL DAVASININ KONUSU',
      'İPTAL TALEBİNİN GEREKÇESİ',
      'TEBLİĞNAME',
    ],
  ],
  [
    'surec',
    [
      'YARGILAMA SÜRECİ',
      'BAŞVURU SÜRECİ',
      'DOSYA EVRESİ',
      'OLAY VE OLGULAR',
      'OLAYLAR',
      'İLK DERECE MAHKEMESİ KARARI',
      'BÖLGE ADLİYE MAHKEMESİ KARARI',
      'BÖLGE İDARE MAHKEMESİ KARARI',
      'İSTİNAF',
      'TEMYİZ',
      'İNCELENEN KARAR',
      'BOZMA KARARI',
      'DİRENME KARARI',
      'RAPORTÖR GÖRÜŞÜ',
      'DANIŞTAY TETKİK HÂKİMİ DÜŞÜNCESİ',
      'DANIŞTAY TETKİK HAKİMİ DÜŞÜNCESİ',
      'DANIŞTAY SAVCISI DÜŞÜNCESİ',
    ],
  ],
  [
    'gerekce',
    [
      'GEREKÇE',
      'İNCELEME VE GEREKÇE',
      'DEĞERLENDİRME',
      'İNCELEME VE DEĞERLENDİRME',
      'DEĞERLENDİRME VE GEREKÇE',
      'UYUŞMAZLIK',
      'UYUŞMAZLIK KONUSU',
      'İLGİLİ HUKUK',
      'ESASIN İNCELENMESİ',
      'HUKUK GENEL KURULU KARARI',
      'CEZA GENEL KURULU KARARI',
      'DAİRE KARARI',
    ],
  ],
  ['hukum', ['HÜKÜM', 'HÜKÜM SONUCU', 'KARAR', 'SONUÇ', 'SONUÇ VE KARAR']],
];

/** tr-TR lower case without the runtime locale: İ to i, I to ı, then the default mapping. */
function trLower(s: string): string {
  return s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

const CONJUNCTIONS = new Set(['VE', 'İLE', 'VEYA']);

/** "DEĞERLENDİRME VE GEREKÇE" to "Değerlendirme Ve Gerekçe", "Değerlendirme ve Gerekçe", "Değerlendirme ve gerekçe". */
function mixedForms(upper: string): string[] {
  const words = upper.split(' ');
  const cap = (w: string): string => (w[0] ?? '') + trLower(w.slice(1));
  const title = words.map(cap).join(' ');
  const titleLower = words.map((w, i) => (i > 0 && CONJUNCTIONS.has(w) ? trLower(w) : cap(w))).join(' ');
  const sentence = (upper[0] ?? '') + trLower(upper.slice(1));
  return [...new Set([title, titleLower, sentence])];
}

interface HeadingForm {
  section: ChunkSection;
  text: string;
  upper: boolean;
}

const FORMS: HeadingForm[] = SECTION_HEADINGS.flatMap(([section, list]) =>
  list.flatMap((h) => [
    { section, text: h, upper: true },
    ...mixedForms(h).map((text) => ({ section, text, upper: false })),
  ]),
).sort((a, b) => b.text.length - a.text.length || Number(b.upper) - Number(a.upper));

/** Optional enumerator before a heading: "III.", "II.GEREKÇE", "C.", "A-", "2)". Group 1 is a digit form. */
const ENUMERATOR = /^(?:(?:[IVX]{1,6}|[A-ZÇĞİÖŞÜ]|([0-9]{1,3}))[ \t]*[.)-][ \t]*)?/u;
const SPACE = /\s/u;
const LETTER = /\p{L}/u;
const UPPER = /\p{Lu}/u;

/** The first word of `s` after leading whitespace (split on whitespace). */
function firstWord(s: string): string {
  return s.trimStart().split(/\s/u)[0] ?? '';
}

export interface HeadingMatch {
  section: ChunkSection;
  /** Index just after the heading (and its colon, if any). */
  end: number;
}

/**
 * Heading that starts at `pos` of a line, or null. At the line start: an upper case heading may run on into the
 * text ("II.GEREKÇE Suç tarihinde ...") unless the next word is itself an upper case word of two or more letters,
 * which marks a header field such as "DAVA TARİHİ :" or "TEMYİZ EDEN :"; a title or sentence case heading
 * ("C. Gerekçe", "Davacı İstemi:") counts when it fills the line, ends in a colon or, after an enumerator, runs on
 * into a capitalised word. Inside a line (after a sentence end or right after another heading, as in texts whose
 * line breaks were lost) a heading needs a Roman numeral or letter enumerator, except an upper case heading
 * followed by a colon and the separate opinion headings.
 */
export function headingAt(line: string, pos: number): HeadingMatch | null {
  const lineStart = pos === 0;
  const s = line.slice(pos);
  const en = ENUMERATOR.exec(s);
  const enLen = en?.[0].length ?? 0;
  const hasEnum = enLen > 0 && (lineStart || en?.[1] === undefined);
  if (enLen > 0 && !hasEnum) return null;
  const rest = s.slice(enLen);
  for (const f of FORMS) {
    if (!rest.startsWith(f.text)) continue;
    const after = rest.slice(f.text.length);
    const colon = /^[ \t]*:/u.exec(after);
    const end = pos + enLen + f.text.length + (colon ? colon[0].length : 0);
    if (after === '' || colon) {
      if (lineStart || hasEnum || f.upper) return { section: f.section, end };
      continue;
    }
    if (!SPACE.test(after[0] ?? '') && !(f.upper && /^[.;-]/u.test(after))) continue;
    const next = firstWord(after);
    if (f.upper) {
      if (!lineStart && !hasEnum && f.section !== 'karsi_oy') continue;
      const letters = [...next].filter((c) => LETTER.test(c));
      const headerField = letters.length >= 2 && letters.every((c) => UPPER.test(c));
      if (!headerField) return { section: f.section, end };
    } else if (hasEnum && SPACE.test(after[0] ?? '') && UPPER.test([...next][0] ?? '')) {
      return { section: f.section, end };
    }
  }
  return null;
}

/** Section that a paragraph opens, or null (headingAt at the start of the paragraph). */
export function sectionHeading(paragraph: string): ChunkSection | null {
  return headingAt(paragraph, 0)?.section ?? null;
}

/** Headings of one trimmed line, in order: at the start, after sentence ends and right after another heading. */
export function headingsIn(line: string): { pos: number; h: HeadingMatch }[] {
  const ends = [...line.matchAll(/[.:;]\s+/gu)].map((m) => (m.index ?? 0) + m[0].length);
  const out: { pos: number; h: HeadingMatch }[] = [];
  let floor = 0;
  let nested: number | null = 0;
  let k = 0;
  for (;;) {
    while (k < ends.length && (ends[k] ?? 0) < floor) k++;
    let pos: number;
    const e = ends[k];
    if (nested !== null && (e === undefined || nested <= e)) {
      pos = nested;
      nested = null;
      if (e === pos) k++;
    } else if (e !== undefined) {
      pos = e;
      k++;
    } else break;
    const h = headingAt(line, pos);
    if (!h) continue;
    out.push({ pos, h });
    floor = h.end;
    let q = h.end;
    while (q < line.length && SPACE.test(line[q] ?? '')) q++;
    nested = q < line.length ? q : null;
  }
  return out;
}

/** Sentence ends that are not abbreviations such as "m.", "E.", "K.", "s.", "vd.". */
const SENTENCE_END =
  /(?<!(?<![\p{L}])(?:\p{L}|md|vd|bkz|age|dn|no|art|sy|syf|vb|vs|örn|ör|T\.C))[.!?;:](?=\s+[\p{Lu}(“"0-9])/gu;

function splitLong(text: string, start: number, max: number): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let from = 0;
  while (text.length - from > max) {
    const window = text.slice(from, from + max);
    let cut = -1;
    for (const m of window.matchAll(SENTENCE_END)) if ((m.index ?? 0) > max * 0.4) cut = (m.index ?? 0) + 1;
    if (cut < 0) {
      const space = window.lastIndexOf(' ');
      cut = space > max * 0.4 ? space : max;
    }
    out.push({ text: text.slice(from, from + cut).trim(), start: start + from });
    from += cut;
    while (text[from] === ' ') from++;
  }
  if (from < text.length) out.push({ text: text.slice(from).trim(), start: start + from });
  return out;
}

interface Paragraph {
  text: string;
  start: number;
  section: ChunkSection | null;
  /** First piece of a segment that opens a section: never merged into a previous passage with body text. */
  opens: boolean;
  /** The paragraph is nothing but a heading ("V. TEMYİZ" on its own line). */
  headOnly: boolean;
}

/**
 * Splits a servable text into passages (chunks table rows): paragraphs are kept whole when they fit, merged
 * when short and split at sentence ends when long. charStart and charEnd index into `text`, so a quote can be
 * highlighted in the full record (FR-82). With `sections`, a decision heading starts a new passage and labels it;
 * a heading alone is joined to the next one, so "V. TEMYİZ" followed by "A. Temyiz Sebepleri" is one passage
 * labelled by the inner heading.
 */
export function chunkText(recordId: string, text: string, opts: ChunkOptions = {}): Chunk[] {
  const max = opts.max ?? 1200;
  const min = opts.min ?? 200;
  const paragraphs: Paragraph[] = [];
  let section: ChunkSection | null = null;
  const re = /[^\n]+/g;
  for (const m of text.matchAll(re)) {
    const t = m[0].trim();
    if (!t) continue;
    const start = (m.index ?? 0) + m[0].indexOf(t);
    // Segments of the line: [from, to) with the section in force and whether a heading opens it.
    const segs: {
      from: number;
      to: number;
      section: ChunkSection | null;
      opens: boolean;
      headEnd: number;
    }[] = [];
    let cur = { from: 0, to: t.length, section, opens: false, headEnd: 0 };
    segs.push(cur);
    if (opts.sections) {
      let joinAt = -1;
      for (const { pos, h } of headingsIn(t)) {
        if (pos === joinAt || (pos === 0 && cur.from === 0)) {
          // Directly after another heading (or at the line start): the same segment, the inner section.
          cur.section = h.section;
          cur.opens = true;
        } else {
          cur.to = pos;
          cur = { from: pos, to: t.length, section: h.section, opens: true, headEnd: 0 };
          segs.push(cur);
        }
        cur.headEnd = h.end;
        let q = h.end;
        while (q < t.length && SPACE.test(t[q] ?? '')) q++;
        joinAt = q;
      }
    }
    for (const g of segs) {
      const body = t.slice(g.from, g.to).trimEnd();
      if (!body) continue;
      section = g.section;
      const at = start + g.from;
      const headOnly = g.opens && g.headEnd >= g.from + body.length;
      const pieces = body.length > max ? splitLong(body, at, max) : [{ text: body, start: at }];
      pieces.forEach((p, i) =>
        paragraphs.push({
          ...p,
          section: g.section,
          opens: g.opens && i === 0,
          headOnly: headOnly && i === 0,
        }),
      );
    }
  }
  const merged: { start: number; end: number; section: ChunkSection | null; headOnly: boolean }[] = [];
  for (const p of paragraphs) {
    const last = merged[merged.length - 1];
    const end = p.start + p.text.length;
    const join = last && (p.opens ? last.headOnly : last.end - last.start < min) && end - last.start <= max;
    if (last && join) {
      last.end = end;
      if (p.opens) last.section = p.section;
      last.headOnly = p.opens && p.headOnly;
    } else merged.push({ start: p.start, end, section: p.section, headOnly: p.headOnly });
  }
  return merged.map((m, seq) => ({
    id: `${recordId}:${seq}`,
    recordId,
    seq,
    section: m.section,
    text: text.slice(m.start, m.end),
    charStart: m.start,
    charEnd: m.end,
  }));
}
