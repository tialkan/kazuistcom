import { normalize } from './normalize.ts';

/** A decision reference found in a query or text (plan 6.5 patterns). */
export interface DecisionRef {
  kind: 'yargi' | 'aym_bireysel' | 'abad' | 'aihm';
  /** "Yargıtay", "Danıştay", "Anayasa Mahkemesi" when written. */
  court: string | null;
  /** "Hukuk Genel Kurulu", "4. Hukuk Dairesi" when written. */
  chamber: string | null;
  esasNo: string | null;
  kararNo: string | null;
  /** ISO date when written. */
  date: string | null;
  /** AYM bireysel başvuru, ABAD case or AİHM application number. */
  number: string | null;
}

const CHAMBERS: [RegExp, string][] = [
  [/^(?:hgk|hukuk genel kurulu)$/, 'Hukuk Genel Kurulu'],
  [/^(?:cgk|ceza genel kurulu)$/, 'Ceza Genel Kurulu'],
  [
    /^(?:ibk|içtihadı birleştirme büyük genel kurulu|içtihatları birleştirme kurulu)$/,
    'İçtihadı Birleştirme',
  ],
  [/^(?:iddk|idari dava daireleri kurulu)$/, 'İdari Dava Daireleri Kurulu'],
  [/^(?:vddk|vergi dava daireleri kurulu)$/, 'Vergi Dava Daireleri Kurulu'],
];

function chamberName(raw: string | undefined, no?: string): string | null {
  if (!raw) return null;
  const r = raw.trim();
  for (const [re, name] of CHAMBERS) if (re.test(r)) return name;
  if (no) {
    if (/^(?:hd|h\.d\.|hukuk dairesi)$/.test(r)) return `${no}. Hukuk Dairesi`;
    if (/^(?:cd|c\.d\.|ceza dairesi)$/.test(r)) return `${no}. Ceza Dairesi`;
    if (/^(?:d|d\.|daire|dairesi)$/.test(r)) return `${no}. Daire`;
  }
  return null;
}

function courtFor(chamber: string | null, text: string): string | null {
  if (/danıştay/.test(text)) return 'Danıştay';
  if (/anayasa mahkemesi|\baym\b/.test(text)) return 'Anayasa Mahkemesi';
  if (/yargıtay/.test(text)) return 'Yargıtay';
  if (chamber && /Kurulu$|Dairesi$|Birleştirme$/.test(chamber) && !/Dava Daireleri/.test(chamber))
    return 'Yargıtay';
  if (chamber && /Dava Daireleri/.test(chamber)) return 'Danıştay';
  return null;
}

function isoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(raw);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const CH = '(hgk|cgk|ibk|iddk|vddk|hukuk genel kurulu|ceza genel kurulu)';
const NO_CH = '(\\d{1,2})\\s*\\.\\s*(hd|cd|h\\.d\\.|c\\.d\\.|hukuk dairesi|ceza dairesi|daire|d\\.)';
const ESAS = '(\\d{4}\\s*/\\s*\\d{1,3}(?:-\\d{1,6})?|\\d{4}\\s*/\\s*\\d{1,6})';
const KARAR = '(\\d{4}\\s*/\\s*\\d{1,6})';
const DATE = '(\\d{1,2}[./]\\d{1,2}[./]\\d{4})';

const tidy = (s: string | undefined): string | null => (s ? s.replace(/\s+/g, '') : null);

/**
 * Decision resolver (plan 7.1/2 with 6.5 patterns): "E. 2013/19-199 K. 2013/1418 T. 13.11.2013",
 * "4. HD 2021/26076 E., 2024/10643 K.", "HGK'nın 13.11.2013 tarih ve 2013/19-199 E., 2013/1418 K. sayılı kararı",
 * AYM "B. No: 2014/1234", ABAD "C-131/12", AİHM "no. 12345/09".
 */
export function resolveDecisions(text: string): DecisionRef[] {
  const n = normalize(text);
  const out: DecisionRef[] = [];
  const push = (d: DecisionRef): void => {
    if (
      !out.some(
        (o) => o.kind === d.kind && o.esasNo === d.esasNo && o.kararNo === d.kararNo && o.number === d.number,
      )
    )
      out.push(d);
  };

  // Chamber written before the numbers: "4. hd 2021/26076 e., 2024/10643 k." or "hgk e. 2013/19-199 k. 2013/1418".
  const chamberFirst = new RegExp(
    `(?:${NO_CH}|${CH})'?[a-zçğıöşü]{0,5}\\s*,?\\s*(?:(?:${DATE})\\s*tarih(?:li)?\\s*ve\\s*)?(?:e\\.?\\s*${ESAS}\\s*,?\\s*k\\.?\\s*${KARAR}|${ESAS}\\s*e\\.?\\s*,?\\s*${KARAR}\\s*k\\.?)`,
    'gu',
  );
  for (const m of n.matchAll(chamberFirst)) {
    const chamber = m[3] ? chamberName(m[3]) : chamberName(m[2], m[1]);
    push({
      kind: 'yargi',
      court: courtFor(chamber, n),
      chamber,
      esasNo: tidy(m[5] ?? m[7]),
      kararNo: tidy(m[6] ?? m[8]),
      date: isoDate(m[4]),
      number: null,
    });
  }

  // Bare numbers: "e. 2013/19-199 k. 2013/1418 t. 13.11.2013" or "2021/26076 e., 2024/10643 k.".
  const bare = new RegExp(
    `(?:e\\.?\\s*${ESAS}\\s*,?\\s*k\\.?\\s*${KARAR}|${ESAS}\\s*e\\.\\s*,?\\s*${KARAR}\\s*k\\.)(?:\\s*,?\\s*t\\.?\\s*${DATE})?`,
    'gu',
  );
  for (const m of n.matchAll(bare)) {
    const esasNo = tidy(m[1] ?? m[3]);
    const kararNo = tidy(m[2] ?? m[4]);
    if (out.some((o) => o.esasNo === esasNo && o.kararNo === kararNo)) continue;
    push({
      kind: 'yargi',
      court: courtFor(null, n),
      chamber: null,
      esasNo,
      kararNo,
      date: isoDate(m[5]),
      number: null,
    });
  }

  for (const m of n.matchAll(/(?<![\p{L}\p{N}])b\.\s*no\s*:?\s*(\d{4}\/\d{1,6})/gu))
    push({
      kind: 'aym_bireysel',
      court: 'Anayasa Mahkemesi',
      chamber: null,
      esasNo: null,
      kararNo: null,
      date: null,
      number: m[1] ?? null,
    });
  for (const m of n.matchAll(/(?<![\p{L}\p{N}])([ct])-(\d{1,4}\/\d{2})(?![\p{N}])/gu))
    push({
      kind: 'abad',
      court: 'Avrupa Birliği Adalet Divanı',
      chamber: null,
      esasNo: null,
      kararNo: null,
      date: null,
      number: `${(m[1] ?? 'c').toLocaleUpperCase('tr-TR')}-${m[2]}`,
    });
  for (const m of n.matchAll(
    /(?<![\p{L}\p{N}])(?:application\s+no\.?|başvuru\s+no\.?|no\.)\s*:?\s*(\d{3,6}\/\d{2})(?![\p{N}/])/gu,
  ))
    push({
      kind: 'aihm',
      court: 'Avrupa İnsan Hakları Mahkemesi',
      chamber: null,
      esasNo: null,
      kararNo: null,
      date: null,
      number: m[1] ?? null,
    });
  return out;
}

/** Normalised esas or karar number for matching ("2013/19-199" and "2013 / 19-199" compare equal). */
export const decisionKey = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, '');
