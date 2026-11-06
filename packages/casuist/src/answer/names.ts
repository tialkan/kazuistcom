/**
 * Person name detection for the line validator (Ek D.2/d, FR-21). The server can plug in the NER service; the
 * built in detector is a conservative rule set that also runs in the browser: honorifics followed by a
 * capitalised word, and a common Turkish given name followed by a capitalised surname. Mask labels such as
 * [KİŞİ-1] or [Davacı] are never names.
 */
export interface NameDetector {
  find(text: string): string[] | Promise<string[]>;
}

const UPPER = 'A-ZÇĞİÖŞÜ';
const LOWER = 'a-zçğıöşüâîû';
const CAP = `[${UPPER}][${LOWER}]+|[${UPPER}]{2,}`;

const HONORIFIC = new RegExp(
  `(?<![\\p{L}])(?:Av\\.|Avukat|Dr\\.|Prof\\.|Doç\\.|Sayın|Bay|Bayan|Hâkim|Hakim|Savcı|Bilirkişi|Mr\\.|Mrs\\.|Ms\\.)\\s+(?:${CAP})(?:\\s+(?:${CAP}))?`,
  'gu',
);

/** Common Turkish given names (curated, not exhaustive; words that are also common nouns left out). A capitalised
 * surname must follow for a match. */
const GIVEN = [
  'Ahmet',
  'Mehmet',
  'Mustafa',
  'Ali',
  'Hüseyin',
  'Hasan',
  'İbrahim',
  'İsmail',
  'Osman',
  'Yusuf',
  'Murat',
  'Ömer',
  'Ramazan',
  'Halil',
  'Süleyman',
  'Abdullah',
  'Mahmut',
  'Salih',
  'Kemal',
  'Recep',
  'Fatih',
  'Emre',
  'Burak',
  'Cem',
  'Eymen',
  'Efe',
  'Berat',
  'Yiğit',
  'Arda',
  'Tarık',
  'Serkan',
  'Hakan',
  'Volkan',
  'Orhan',
  'Erkan',
  'Gökhan',
  'Tolga',
  'Onur',
  'Uğur',
  'Kadir',
  'Selim',
  'Sinan',
  'Levent',
  'Bülent',
  'Cengiz',
  'Fatma',
  'Ayşe',
  'Emine',
  'Hatice',
  'Zeynep',
  'Elif',
  'Meryem',
  'Şerife',
  'Zehra',
  'Hanife',
  'Merve',
  'Esra',
  'Özlem',
  'Yasemin',
  'Hülya',
  'Leyla',
  'Derya',
  'Ebru',
  'Seda',
  'Sibel',
  'Aylin',
  'Burcu',
  'Büşra',
  'Ecrin',
  'Defne',
  'Asel',
  'Selin',
  'Gamze',
  'Tuğba',
  'Canan',
  'Nihan',
  'Songül',
  'Filiz',
];
const GIVEN_NAME = new RegExp(`(?<![\\p{L}])(?:${GIVEN.join('|')})\\s+(?:${CAP})(?![\\p{L}])`, 'gu');

/** Words that legitimately follow a given name in legal text (street, company, foundation names are masked). */
const NOT_SURNAME = /^(?:Kanunu|Kanun|Mahkemesi|Dairesi|Kurulu|Bey|Hanım|Efendi)$/u;

/** Character spans of likely person names; mask labels are blanked first so offsets stay aligned. */
export function nameSpans(text: string): { start: number; end: number }[] {
  const clean = text.replace(/\[[^\]\n]{1,30}\]/g, (m) => ' '.repeat(m.length));
  const out: { start: number; end: number }[] = [];
  for (const m of clean.matchAll(HONORIFIC))
    out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  for (const m of clean.matchAll(GIVEN_NAME)) {
    const surname = m[0].split(/\s+/)[1] ?? '';
    if (NOT_SURNAME.test(surname)) continue;
    const start = m.index ?? 0;
    if (!out.some((s) => start < s.end && start + m[0].length > s.start))
      out.push({ start, end: start + m[0].length });
  }
  return out.sort((a, b) => a.start - b.start);
}

export const heuristicNames: NameDetector = {
  find(text: string): string[] {
    return [...new Set(nameSpans(text).map((s) => text.slice(s.start, s.end)))];
  },
};
