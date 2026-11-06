import { LAWS, lawByNo, type Law } from './laws.ts';
import { normalize } from './normalize.ts';

/** plan 7.1/1 output; matches contracts NormRef. */
export interface ResolvedNorm {
  kanunNo: string;
  kanunAdi: string | null;
  madde: string;
  fikra: string | null;
  bent: string | null;
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byLength = (a: string, b: string): number => b.length - a.length;

const aliasToLaw = new Map<string, Law>();
for (const law of LAWS) for (const t of law.takma) aliasToLaw.set(t, law);
const ALL = [...aliasToLaw.keys()].sort(byLength).map(esc).join('|');
const BARE = LAWS.filter((l) => l.yalinNumara)
  .flatMap((l) => l.takma.filter((t) => !t.includes(' ')))
  .sort(byLength)
  .map(esc)
  .join('|');

const L = '[a-zçğıöşüâîû]';
/** Inflection after a law name: "kvkk'nın", "kanunu'nun", "kanununun", "anayasa'nın". */
const SUF = `(?:'?${L}{0,6})?`;
const ART = `(?:maddesi(?:nin|ne|nde)?|madde|mad\\.|md\\.?|m\\.|m\\s|art\\.|article|art\\s)`;
/** "11", "11/1", "11/1-c", "17(1)(a)". */
const NUM = `(\\d{1,4})(?:\\s*/\\s*(\\d{1,2})(?:\\s*-\\s*(${L}{1,2})(?![\\p{L}]))?|\\((\\d{1,2})\\)(?:\\((${L})\\))?)?`;
const ORD = `(?:\\.|'?\\s*(?:inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü))`;
const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';

const PATTERNS: {
  re: RegExp;
  kind: 'alias' | 'bare' | 'number' | 'ordinal' | 'numberOrdinal' | 'artFirst';
}[] = [
  // "kvkk m.11/1-c", "gdpr art. 17(1)(a)", "türk borçlar kanunu madde 49".
  { re: new RegExp(`${B}(${ALL})${SUF}\\s*,?\\s*${ART}\\s*${NUM}`, 'gu'), kind: 'alias' },
  // "tbk 49", "kvkk 11/1-c".
  {
    re: new RegExp(`${B}(${BARE})${SUF}\\s+${NUM}${E}(?!\\s*(?:sayılı|s\\.|yıl|gün|ay))`, 'gu'),
    kind: 'bare',
  },
  // "türk borçlar kanunu'nun 49. maddesi", "kvkk'nın 11. maddesinin 1. fıkrasının (c) bendi".
  {
    re: new RegExp(
      `${B}(${ALL})${SUF}\\s+(\\d{1,4})\\s*${ORD}\\s*madde${L}*(?:\\s+(\\d{1,2})\\s*${ORD}\\s*fıkra${L}*)?(?:\\s+\\(?(${L})\\)?\\s*bend${L}*)?`,
      'gu',
    ),
    kind: 'ordinal',
  },
  // "6698 s. kanun m. 11/1-c", "6698 sayılı kişisel verilerin korunması kanunu madde 11".
  {
    re: new RegExp(
      `${B}(\\d{3,4})\\s*(?:s\\.|sy\\.|sayılı)\\s*(?:[\\p{L} ]{0,80}?)(?:kanun|k\\.)${SUF}\\s*,?\\s*${ART}\\s*${NUM}`,
      'gu',
    ),
    kind: 'number',
  },
  // "6698 sayılı kanun'un 11. maddesi".
  {
    re: new RegExp(
      `${B}(\\d{3,4})\\s*(?:s\\.|sy\\.|sayılı)\\s*(?:[\\p{L} ]{0,80}?)(?:kanun|k\\.)${SUF}\\s+(\\d{1,4})\\s*${ORD}\\s*madde${L}*(?:\\s+(\\d{1,2})\\s*${ORD}\\s*fıkra${L}*)?(?:\\s+\\(?(${L})\\)?\\s*bend${L}*)?`,
      'gu',
    ),
    kind: 'numberOrdinal',
  },
  // "art. 17 gdpr", "article 17(1) of the gdpr".
  {
    re: new RegExp(`${B}(?:art\\.|article)\\s*${NUM}\\s*(?:of\\s+(?:the\\s+)?)?(gdpr)${E}`, 'gu'),
    kind: 'artFirst',
  },
];

function build(
  law: Law | undefined,
  kanunNo: string,
  madde?: string,
  fikra?: string,
  bent?: string,
): ResolvedNorm | null {
  if (!madde) return null;
  return {
    kanunNo,
    kanunAdi: law?.ad ?? null,
    madde: String(Number(madde)),
    fikra: fikra ? String(Number(fikra)) : null,
    bent: bent ?? null,
  };
}

const key = (n: ResolvedNorm): string => `${n.kanunNo}|${n.madde}|${n.fikra ?? ''}|${n.bent ?? ''}`;

/**
 * Norm resolver (plan 7.1/1): "KVKK m.11", "6698 s. Kanun m. 11/1-c", "TBK 49",
 * "Türk Borçlar Kanunu'nun 49. maddesi", "GDPR Art. 17"; "md." and "madde" are equivalent.
 * Returns each reference once, in order of appearance.
 */
export function resolveNorms(text: string): ResolvedNorm[] {
  const n = normalize(text);
  const found: { at: number; norm: ResolvedNorm }[] = [];
  for (const { re, kind } of PATTERNS) {
    for (const m of n.matchAll(re)) {
      let norm: ResolvedNorm | null;
      if (kind === 'alias' || kind === 'bare') {
        const law = aliasToLaw.get(m[1] ?? '');
        if (!law) continue;
        // "ay" alone is a Turkish word; only "ay m.20" style references count.
        if (m[1] === 'ay' && kind !== 'alias') continue;
        // "KVKK 2016" is a year, not an article.
        if (kind === 'bare' && Number(m[2]) >= 1900 && Number(m[2]) <= 2100 && !m[3] && !m[5]) continue;
        norm = build(law, law.no, m[2], m[3] ?? m[5], m[4] ?? m[6]);
      } else if (kind === 'ordinal') {
        const law = aliasToLaw.get(m[1] ?? '');
        if (!law || m[1] === 'ay') continue;
        norm = build(law, law.no, m[2], m[3], m[4]);
      } else if (kind === 'number') {
        norm = build(lawByNo(m[1] ?? ''), m[1] ?? '', m[2], m[3] ?? m[5], m[4] ?? m[6]);
      } else if (kind === 'numberOrdinal') {
        norm = build(lawByNo(m[1] ?? ''), m[1] ?? '', m[2], m[3], m[4]);
      } else {
        const law = aliasToLaw.get(m[6] ?? '');
        norm = build(law, law?.no ?? 'GDPR', m[1], m[2] ?? m[4], m[3] ?? m[5]);
      }
      if (norm) found.push({ at: m.index ?? 0, norm });
    }
  }
  found.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const out: ResolvedNorm[] = [];
  for (const f of found) {
    const k = key(f.norm);
    // A shorter match of the same article ("kvkk 11") is dropped when a fuller one exists ("kvkk 11/1-c").
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f.norm);
  }
  return out.filter(
    (a) =>
      !out.some(
        (b) =>
          b !== a &&
          b.kanunNo === a.kanunNo &&
          b.madde === a.madde &&
          !a.fikra &&
          (b.fikra !== null || b.bent !== null),
      ),
  );
}

/** Short citation such as "KVKK m.11/1-c" or "6098 s. Kanun m.49". */
export function formatNorm(n: Pick<ResolvedNorm, 'kanunNo' | 'madde' | 'fikra' | 'bent'>): string {
  const law = lawByNo(n.kanunNo);
  const short = law?.takma[0];
  const head = short && short.length <= 5 ? short.toLocaleUpperCase('tr-TR') : `${n.kanunNo} s. Kanun`;
  const tail = `${n.fikra ? `/${n.fikra}` : ''}${n.bent ? `-${n.bent}` : ''}`;
  if (n.kanunNo === 'GDPR')
    return `GDPR Art. ${n.madde}${n.fikra ? `(${n.fikra})` : ''}${n.bent ? `(${n.bent})` : ''}`;
  return `${head} m.${n.madde}${tail}`;
}

/** True when the record norm covers the query norm (same law and article; finer parts must not conflict). */
export function normMatches(
  query: Pick<ResolvedNorm, 'kanunNo' | 'madde' | 'fikra'>,
  record: Pick<ResolvedNorm, 'kanunNo' | 'madde' | 'fikra'>,
): boolean {
  if (query.kanunNo !== record.kanunNo || query.madde !== record.madde) return false;
  return !query.fikra || !record.fikra || query.fikra === record.fikra;
}
