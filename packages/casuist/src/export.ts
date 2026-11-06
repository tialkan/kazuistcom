import type { RecordType } from '@kazuist/contracts';

/** What an export needs from a saved record (records joined with library_items). */
export interface ExportItem {
  recordId: string;
  type: RecordType;
  title: string;
  court: string | null;
  chamber: string | null;
  esasNo: string | null;
  kararNo: string | null;
  date: string | null;
  sourceUrl: string;
  jurisdiction: string;
  note: string | null;
}

/** Formats implemented by this module. İSNAD, OSCOLA and Bluebook need a CSL processor (see DEVIR). */
export const MACHINE_FORMATS = ['ris', 'bibtex'] as const;
export type MachineFormat = (typeof MACHINE_FORMATS)[number];

const RIS_TYPE: Record<RecordType, string> = {
  mevzuat: 'STAT',
  karar: 'CASE',
  kurul_karari: 'CASE',
  makale: 'JOUR',
  kitap: 'BOOK',
  tez: 'THES',
  ab_hukuku: 'STAT',
};

const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim();
const year = (d: string | null): string | null => (d && /^\d{4}/.test(d) ? d.slice(0, 4) : null);

/** RIS (Zotero, EndNote, Mendeley import). One record per entry, CRLF line ends as the format expects. */
export function toRis(items: readonly ExportItem[]): string {
  const out: string[] = [];
  for (const it of items) {
    const tag = (k: string, v: string | null | undefined): void => {
      if (v) out.push(`${k}  - ${oneLine(v)}`);
    };
    tag('TY', RIS_TYPE[it.type]);
    tag('TI', it.title);
    if (it.type === 'karar' || it.type === 'kurul_karari') {
      tag('A2', it.court);
      tag('SE', it.chamber);
      tag(
        'M1',
        [it.esasNo ? `E. ${it.esasNo}` : null, it.kararNo ? `K. ${it.kararNo}` : null]
          .filter(Boolean)
          .join(' ') || null,
      );
    }
    tag('PY', year(it.date));
    tag('DA', it.date ? it.date.replace(/-/g, '/') : null);
    tag('CY', it.jurisdiction);
    tag('UR', it.sourceUrl);
    tag('N1', it.note);
    out.push('ER  - ', '');
  }
  return out.join('\r\n');
}

const BIB_SPECIAL = /[\\{}%&$#_^~]/g;
function bibEscape(s: string): string {
  return oneLine(s).replace(BIB_SPECIAL, (c) =>
    c === '\\' ? '\\textbackslash{}' : c === '^' ? '\\^{}' : c === '~' ? '\\~{}' : `\\${c}`,
  );
}

/** ASCII citation key: type, year and a short id part ("karar2022a1b2c3"). */
function bibKey(it: ExportItem): string {
  return `${it.type.replace(/_/g, '')}${year(it.date) ?? 'ty'}${it.recordId.replace(/-/g, '').slice(0, 6)}`;
}

/** BibTeX. Legal sources are @misc with a `type` field; Zotero maps them on import. */
const BIB_ENTRY: Record<RecordType, string> = {
  mevzuat: 'misc',
  karar: 'misc',
  kurul_karari: 'misc',
  makale: 'article',
  kitap: 'book',
  tez: 'phdthesis',
  ab_hukuku: 'misc',
};
const BIB_KIND: Partial<Record<RecordType, string>> = {
  mevzuat: 'legislation',
  ab_hukuku: 'legislation',
  karar: 'jurisdiction',
  kurul_karari: 'jurisdiction',
};

export function toBibtex(items: readonly ExportItem[]): string {
  const entries = items.map((it) => {
    const number = [it.esasNo ? `E. ${it.esasNo}` : null, it.kararNo ? `K. ${it.kararNo}` : null]
      .filter(Boolean)
      .join(' ');
    // Values are escaped once; the title keeps an inner brace pair so BibTeX styles do not change its case.
    const fields: [string, string | null][] = [
      ['title', `{${bibEscape(it.title)}}`],
      ['year', year(it.date)],
      ['date', it.date],
      ['type', BIB_KIND[it.type] ?? null],
      ['institution', it.court ? bibEscape(it.court) : null],
      ['number', number ? bibEscape(number) : null],
      ['url', it.sourceUrl.replace(/[{}]/g, '')],
      ['note', it.note ? bibEscape(it.note) : null],
    ];
    const body = fields
      .filter((f): f is [string, string] => Boolean(f[1]))
      .map(([k, v]) => `  ${k} = {${v}}`)
      .join(',\n');
    return `@${BIB_ENTRY[it.type]}{${bibKey(it)},\n${body}\n}`;
  });
  return entries.length ? `${entries.join('\n\n')}\n` : '';
}

/** Plain citation list for "Kaynakçayı kopyala" (FR-23): one künye per line. */
export function toPlainList(items: readonly ExportItem[]): string {
  return items
    .map((it) => {
      const date = it.date ? it.date.split('-').reverse().join('.') : null;
      const parts = [it.title, date && !it.title.includes(date) ? `T. ${date}` : null, it.sourceUrl];
      return parts.filter(Boolean).join(', ');
    })
    .join('\n');
}
