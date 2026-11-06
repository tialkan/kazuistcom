/**
 * Law alias table for the norm resolver (plan 7.1/1). Numbers and names were checked against the first page of
 * the official text on mevzuat.gov.tr (MevzuatMetin/1.5.<no>.pdf) on 7 November 2026; see
 * packages/casuist/fixtures/KAYNAK.md. Editors extend the table; nothing here is guessed.
 */
export interface Law {
  /** Kanun numarası, or a stable code for foreign acts (GDPR). */
  no: string;
  /** Official name as printed on the official text. */
  ad: string;
  /** Lower case (tr-TR) aliases, abbreviations first. */
  takma: string[];
  /** Abbreviations that may stand alone before an article number ("TBK 49"). */
  yalinNumara?: boolean;
  jurisdiction: 'TR' | 'AB';
}

export const LAWS: readonly Law[] = [
  {
    no: '6698',
    ad: 'Kişisel Verilerin Korunması Kanunu',
    takma: ['kvkk', 'kvk kanunu', 'kişisel verilerin korunması kanunu'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '6098',
    ad: 'Türk Borçlar Kanunu',
    takma: ['tbk', 'türk borçlar kanunu'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '4721',
    ad: 'Türk Medeni Kanunu',
    takma: ['tmk', 'türk medeni kanunu'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '5237',
    ad: 'Türk Ceza Kanunu',
    takma: ['tck', 'türk ceza kanunu'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '6100',
    ad: 'Hukuk Muhakemeleri Kanunu',
    takma: ['hmk', 'hukuk muhakemeleri kanunu'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '5271',
    ad: 'Ceza Muhakemesi Kanunu',
    takma: ['cmk', 'ceza muhakemesi kanunu'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '2004',
    ad: 'İcra ve İflas Kanunu',
    takma: ['iik', 'icra ve iflas kanunu'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '6102',
    ad: 'Türk Ticaret Kanunu',
    takma: ['ttk', 'türk ticaret kanunu'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '2577',
    ad: 'İdari Yargılama Usulü Kanunu',
    takma: ['iyuk', 'idari yargılama usulü kanunu'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '2709',
    ad: 'Türkiye Cumhuriyeti Anayasası',
    takma: ['anayasa', 'türkiye cumhuriyeti anayasası', 'ay'],
    jurisdiction: 'TR',
  },
  { no: '4857', ad: 'İş Kanunu', takma: ['iş kanunu'], jurisdiction: 'TR' },
  {
    no: '6502',
    ad: 'Tüketicinin Korunması Hakkında Kanun',
    takma: ['tkhk', 'tüketicinin korunması hakkında kanun'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '5846',
    ad: 'Fikir ve Sanat Eserleri Kanunu',
    takma: ['fsek', 'fikir ve sanat eserleri kanunu'],
    yalinNumara: true,
    jurisdiction: 'TR',
  },
  {
    no: '4054',
    ad: 'Rekabetin Korunması Hakkında Kanun',
    takma: ['rekabetin korunması hakkında kanun'],
    jurisdiction: 'TR',
  },
  {
    no: 'GDPR',
    ad: 'Regulation (EU) 2016/679 (General Data Protection Regulation)',
    takma: ['gdpr', 'genel veri koruma tüzüğü', 'gvkt'],
    yalinNumara: true,
    jurisdiction: 'AB',
  },
];

export const lawByNo = (no: string): Law | undefined => LAWS.find((l) => l.no === no);
