import {
  AlignmentType,
  Document,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  LineRuleType,
  NumberFormat,
  Packer,
  PageNumber,
  Paragraph,
  SectionType,
  TableOfContents,
  TextRun,
  type FileChild,
  type ISectionOptions,
} from 'docx';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { KuralDegerleri, SablonTuru } from './kural-semasi.ts';

/**
 * DOCX templates of SRS 6.3 (thesis, two sections) and SRS 6.5 (article, one section). Runs in Node and in
 * the browser; the rules never leave the device when the browser builds the file.
 *
 * Styles carry the rules, so Zotero and EndNote footnotes follow them: Normal, Heading 1-3 (outline level 0-2,
 * bold), Footnote Text (footnote size). The front matter section counts from 1 in lower roman (or decimal),
 * the main text section counts from 1 in decimal, in the position the rule names.
 */

/** 1 cm is 566.93 twips; rounded. */
const cmTwip = (cm: number) => Math.round(cm * 567);
const ptHalf = (pt: number) => Math.round(pt * 2);
const ptTwip = (pt: number) => Math.round(pt * 20);

const KAGIT: Record<KuralDegerleri['paper'], { width: number; height: number }> = {
  A4: { width: 11906, height: 16838 },
  A5: { width: 8391, height: 11906 },
  B5: { width: 9979, height: 14173 },
  Letter: { width: 12240, height: 15840 },
};

export interface UretimSecenekleri {
  /** Document title written to the file properties. */
  baslik?: string;
}

const ust = (s: string) => s.toLocaleUpperCase('tr-TR');
const kayitAnahtari = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .trim();

const sayiMetni = (n: number) => new Intl.NumberFormat('tr-TR').format(n);

function aralikMetni(a: { min: number | null; max: number | null }, birim: string): string {
  if (a.min !== null && a.max !== null) return `${sayiMetni(a.min)} - ${sayiMetni(a.max)} ${birim}`;
  if (a.max !== null) return `en çok ${sayiMetni(a.max)} ${birim}`;
  return `en az ${sayiMetni(a.min ?? 0)} ${birim}`;
}

const DIPNOT_KAYNAK = 1;
const DIPNOT_YAZAR = 2;

/** Describes the citation system without asserting details the guide did not give. */
function atifAciklamasi(citation: string): string[] {
  const ana = `Atıf sistemi: ${citation}. Kaynakçayı ve atıfları kılavuzunuzdaki biçime göre düzenleyin.`;
  const dipnotlu = /dipnot|isnad|oscola|chicago|bluebook/i.test(citation);
  const ek = dipnotlu
    ? 'Dipnotları Word’ün dipnot özelliğiyle ekleyin (Başvurular, Dipnot Ekle). Zotero ve EndNote eklentileri dipnotları bu şablondaki Dipnot Metni stiliyle yazar.'
    : 'Metin içi atıfları Zotero veya EndNote eklentisiyle ekleyin; kaynakça aynı eklentiyle oluşur.';
  return [ana, ek];
}

function stiller(d: KuralDegerleri, tur: SablonTuru) {
  const satir = Math.round(d.line * 240);
  const yazi = { ascii: d.font, hAnsi: d.font, cs: d.font, eastAsia: d.font };
  const boyut = ptHalf(d.size);
  const baslikBoslugu = { before: ptTwip(12), after: ptTwip(6), line: 240, lineRule: LineRuleType.AUTO };
  const baslik = (pt: number, ekstra: { italics?: boolean } = {}) => ({
    run: { font: yazi, size: ptHalf(pt), bold: true, color: '000000', ...ekstra },
    paragraph: {
      keepNext: true,
      keepLines: true,
      spacing: baslikBoslugu,
      indent: { firstLine: 0 },
      alignment: AlignmentType.LEFT,
    },
  });
  const h1 = baslik(d.h1Size);
  return {
    default: {
      document: {
        run: { font: yazi, size: boyut, language: { value: 'tr-TR' } },
        paragraph: { spacing: { line: satir, lineRule: LineRuleType.AUTO } },
      },
      title: {
        run: { font: yazi, size: ptHalf(d.h1Size), bold: true, color: '000000' },
        paragraph: {
          alignment: AlignmentType.CENTER,
          indent: { firstLine: 0 },
          spacing: { before: 0, after: ptTwip(12), line: 240, lineRule: LineRuleType.AUTO },
        },
      },
      heading1: {
        ...h1,
        paragraph: {
          ...h1.paragraph,
          outlineLevel: 0,
          // Thesis chapters start on their own page (SRS 6.3); article sections run on.
          pageBreakBefore: tur === 'tez',
        },
      },
      heading2: { ...baslik(d.h2Size), paragraph: { ...baslik(d.h2Size).paragraph, outlineLevel: 1 } },
      heading3: {
        ...baslik(d.h3Size, { italics: true }),
        paragraph: { ...baslik(d.h3Size).paragraph, outlineLevel: 2 },
      },
      footnoteText: {
        run: { font: yazi, size: ptHalf(d.footSize) },
        paragraph: {
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: 0 },
          spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
        },
      },
    },
    paragraphStyles: [
      {
        id: 'Normal',
        name: 'Normal',
        quickFormat: true,
        run: { font: yazi, size: boyut },
        paragraph: {
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: cmTwip(d.indent) },
          spacing: { line: satir, lineRule: LineRuleType.AUTO, before: 0, after: ptTwip(d.spAfter) },
        },
      },
      {
        // Front matter titles that must stay out of the table of contents (outline level body text).
        id: 'OnKisimBasligi',
        name: 'Ön Kısım Başlığı',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: yazi, size: ptHalf(d.h1Size), bold: true, color: '000000' },
        paragraph: {
          alignment: AlignmentType.CENTER,
          indent: { firstLine: 0 },
          pageBreakBefore: true,
          keepNext: true,
          spacing: { before: 0, after: ptTwip(12), line: 240, lineRule: LineRuleType.AUTO },
        },
      },
      {
        id: 'Kapak',
        name: 'Kapak',
        basedOn: 'Normal',
        quickFormat: true,
        run: { font: yazi, size: boyut },
        paragraph: {
          alignment: AlignmentType.CENTER,
          indent: { firstLine: 0 },
          spacing: { before: 0, after: ptTwip(18), line: 240, lineRule: LineRuleType.AUTO },
        },
      },
      {
        id: 'Kaynakca',
        name: 'Kaynakça Girdisi',
        basedOn: 'Normal',
        quickFormat: true,
        paragraph: {
          alignment: AlignmentType.LEFT,
          indent: { left: cmTwip(1.25), hanging: cmTwip(1.25) },
        },
      },
    ],
  };
}

const p = (metin: string, stil?: string) =>
  new Paragraph({ ...(stil ? { style: stil } : {}), children: [new TextRun(metin)] });

function baslikP(metin: string, duzey: 1 | 2 | 3, d: KuralDegerleri) {
  const seviye =
    duzey === 1 ? HeadingLevel.HEADING_1 : duzey === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  return new Paragraph({
    heading: seviye,
    children: [new TextRun(duzey === 1 && d.h1Upper ? ust(metin) : metin)],
  });
}

function numaraAlani(d: KuralDegerleri, ilkSayfaBos: boolean) {
  const alan = new Paragraph({
    style: 'Kapak',
    alignment: d.pageNum === 'alt-orta' ? AlignmentType.CENTER : AlignmentType.RIGHT,
    spacing: { after: 0 },
    children: [new TextRun({ children: [PageNumber.CURRENT] })],
  });
  const bos = () => new Paragraph({ style: 'Kapak', spacing: { after: 0 }, children: [] });
  if (d.pageNum === 'ust-sag') {
    return {
      headers: {
        default: new Header({ children: [alan] }),
        ...(ilkSayfaBos ? { first: new Header({ children: [bos()] }) } : {}),
      },
      footers: ilkSayfaBos ? { first: new Footer({ children: [bos()] }) } : {},
    };
  }
  return {
    footers: {
      default: new Footer({ children: [alan] }),
      ...(ilkSayfaBos ? { first: new Footer({ children: [bos()] }) } : {}),
    },
    headers: ilkSayfaBos ? { first: new Header({ children: [bos()] }) } : {},
  };
}

function sayfaOzellikleri(
  d: KuralDegerleri,
  bicim: (typeof NumberFormat)[keyof typeof NumberFormat],
  ilkSayfaBos: boolean,
  tip: (typeof SectionType)[keyof typeof SectionType],
): ISectionOptions['properties'] {
  return {
    type: tip,
    page: {
      size: KAGIT[d.paper],
      margin: {
        top: cmTwip(d.mTop),
        bottom: cmTwip(d.mBottom),
        left: cmTwip(d.mLeft),
        right: cmTwip(d.mRight),
        header: cmTwip(1.25),
        footer: cmTwip(1.25),
        gutter: 0,
      },
      pageNumbers: { start: 1, formatType: bicim },
    },
    titlePage: ilkSayfaBos,
  };
}

const kapakSatiri = (metin: string) => p(metin, 'Kapak');

/** Centered placeholders of the outer and inner cover (SRS 6.3). The inner cover starts a new page. */
function kapakSayfasi(d: KuralDegerleri, yeniSayfa: boolean): Paragraph[] {
  const satirlar = [
    'T.C.',
    ust(d.institution.startsWith('[') ? '[Üniversite adı]' : d.institution),
    ust('[Enstitü adı]'),
    ust('[Anabilim dalı]'),
    ust('[Tez başlığı]'),
    '[Yazar adı soyadı]',
    '[Tez türü: yüksek lisans tezi veya doktora tezi]',
    '[Danışman: unvan, ad soyad]',
    '[Şehir] [Yıl]',
  ];
  return satirlar.map((metin, i) =>
    i === 0 && yeniSayfa
      ? new Paragraph({ style: 'Kapak', pageBreakBefore: true, children: [new TextRun(metin)] })
      : kapakSatiri(metin),
  );
}

function ozetSayfasi(d: KuralDegerleri, ad: string, ingilizce: boolean): Paragraph[] {
  const anahtar = ingilizce ? 'Keywords:' : 'Anahtar kelimeler:';
  const yer = ingilizce ? '[Abstract text]' : '[Özet metni]';
  const sinir = d.absLimit.max !== null ? ` (${aralikMetni(d.absLimit, 'kelime')})` : '';
  return [
    baslikP(ad, 1, d),
    p(`${yer}${ingilizce ? '' : sinir}`),
    p(`${anahtar} [anahtar kelime 1], [anahtar kelime 2], [anahtar kelime 3]`),
  ];
}

function govdeOrnegi(d: KuralDegerleri, dipnotlu: boolean): Paragraph[] {
  const metin = new Paragraph({
    children: [
      new TextRun('[Bölüm metni. Paragraf girintisi ve satır aralığı Normal stilinden gelir.]'),
      ...(dipnotlu ? [new FootnoteReferenceRun(DIPNOT_KAYNAK)] : []),
    ],
  });
  return [
    metin,
    baslikP('[İkinci düzey başlık]', 2, d),
    p('[İkinci düzey başlığın metni.]'),
    baslikP('[Üçüncü düzey başlık]', 3, d),
    p('[Üçüncü düzey başlığın metni.]'),
  ];
}

function kaynakcaSayfasi(d: KuralDegerleri, ad: string): Paragraph[] {
  return [
    baslikP(ad, 1, d),
    ...atifAciklamasi(d.citation).map((m) => p(m)),
    p('[Kaynakça girdisi 1]', 'Kaynakca'),
    p('[Kaynakça girdisi 2]', 'Kaynakca'),
  ];
}

function notBolumu(d: KuralDegerleri): Paragraph[] {
  if (!d.notes.length) return [];
  return [
    new Paragraph({ children: [new TextRun({ text: 'Şablona yansıtılamayan kurallar', bold: true })] }),
    ...d.notes.map((n) => p(`- ${n}`)),
  ];
}

function bolumIcerigi(ad: string, d: KuralDegerleri, ilkDegil: boolean, anaMetin: boolean): FileChild[] {
  const k = kayitAnahtari(ad);
  if (k === 'dis kapak') return kapakSayfasi(d, ilkDegil);
  if (k === 'ic kapak') return kapakSayfasi(d, ilkDegil);
  if (k === 'ozet') return ozetSayfasi(d, ad, false);
  if (k === 'abstract') return ozetSayfasi(d, ad, true);
  if (k === 'etik beyan')
    return [baslikP(ad, 1, d), p('[Etik beyan metni: enstitünüzün kılavuzundaki metni buraya yazın.]')];
  if (k === 'icindekiler')
    return [
      new Paragraph({ style: 'OnKisimBasligi', children: [new TextRun(ust(ad))] }),
      new TableOfContents('', { hyperlink: true, headingStyleRange: '1-3' }),
    ];
  if (k === 'kaynakca') return kaynakcaSayfasi(d, ad);
  if (anaMetin) {
    const ilkAnaMetin = k === 'giris';
    return [baslikP(ad, 1, d), ...govdeOrnegi(d, ilkAnaMetin)];
  }
  return [baslikP(ad, 1, d), p(`[${ad} metni]`)];
}

/** Index of the first main text section: "Giriş", else none (single section document). */
function girisIndeksi(bolumler: readonly string[]): number {
  return bolumler.findIndex((b) => kayitAnahtari(b) === 'giris');
}

function tezBelgesi(d: KuralDegerleri, secenek: UretimSecenekleri): Document {
  const giris = girisIndeksi(d.sections);
  const onKisim = giris > 0 ? d.sections.slice(0, giris) : [];
  const anaMetin = giris >= 0 ? d.sections.slice(giris) : [...d.sections];
  const ilkKapak = onKisim.length > 0 && kayitAnahtari(onKisim[0] ?? '') === 'dis kapak';
  const sections: ISectionOptions[] = [];
  if (onKisim.length) {
    // Cover-like pages other than the first need a page break; titled pages break through their style.
    const cocuklar = onKisim.flatMap((ad, i) => bolumIcerigi(ad, d, i > 0, false));
    sections.push({
      properties: sayfaOzellikleri(
        d,
        d.frontRoman ? NumberFormat.LOWER_ROMAN : NumberFormat.DECIMAL,
        ilkKapak,
        SectionType.NEXT_PAGE,
      ),
      ...numaraAlani(d, ilkKapak),
      children: cocuklar,
    });
  }
  const anaCocuklar = [...anaMetin.flatMap((ad) => bolumIcerigi(ad, d, true, true)), ...notBolumu(d)];
  sections.push({
    properties: sayfaOzellikleri(d, NumberFormat.DECIMAL, false, SectionType.NEXT_PAGE),
    ...numaraAlani(d, false),
    children: anaCocuklar,
  });
  return belge(d, 'tez', sections, secenek);
}

function makaleBelgesi(d: KuralDegerleri, secenek: UretimSecenekleri): Document {
  const sozcukSiniri = aralikMetni(d.wordLimit, 'kelime');
  const ozSiniri = aralikMetni(d.absLimit, 'kelime');
  const cocuklar: Paragraph[] = [
    new Paragraph({ style: 'Title', children: [new TextRun('[Makalenin Türkçe başlığı]')] }),
    new Paragraph({ style: 'Title', children: [new TextRun('[Makalenin İngilizce başlığı]')] }),
    new Paragraph({
      style: 'Kapak',
      children: [new TextRun('[Yazar adı soyadı]'), new FootnoteReferenceRun(DIPNOT_YAZAR)],
    }),
    baslikP('Öz', 1, { ...d, h1Upper: false }),
    p(`[Öz metni: ${ozSiniri}]`),
    p('Anahtar Kelimeler: [anahtar kelime 1], [anahtar kelime 2], [anahtar kelime 3]'),
    baslikP('Abstract', 1, { ...d, h1Upper: false }),
    p(`[Abstract text: ${ozSiniri}]`),
    p('Keywords: [keyword 1], [keyword 2], [keyword 3]'),
    baslikP('Giriş', 1, { ...d, h1Upper: false }),
    p(`[Makale metni: ${sozcukSiniri}. Girinti ve satır aralığı Normal stilinden gelir.]`),
    new Paragraph({
      children: [new TextRun('[Örnek dipnot için işaret.]'), new FootnoteReferenceRun(DIPNOT_KAYNAK)],
    }),
    baslikP('[Ana başlık]', 1, { ...d, h1Upper: false }),
    baslikP('[İkinci düzey başlık]', 2, d),
    p('[İkinci düzey başlığın metni.]'),
    baslikP('[Üçüncü düzey başlık]', 3, d),
    p('[Üçüncü düzey başlığın metni.]'),
    baslikP('Sonuç', 1, { ...d, h1Upper: false }),
    p('[Sonuç metni.]'),
    ...kaynakcaSayfasi({ ...d, h1Upper: false }, 'Kaynakça'),
    ...notBolumu(d),
  ];
  return belge(
    d,
    'makale',
    [
      {
        properties: sayfaOzellikleri(d, NumberFormat.DECIMAL, false, SectionType.NEXT_PAGE),
        ...numaraAlani(d, false),
        children: cocuklar,
      },
    ],
    secenek,
  );
}

function belge(d: KuralDegerleri, tur: SablonTuru, sections: ISectionOptions[], s: UretimSecenekleri): Document {
  return new Document({
    creator: 'Kazuist',
    title: s.baslik ?? (tur === 'tez' ? 'Tez şablonu' : 'Makale şablonu'),
    description: tur === 'tez' ? 'Kazuist tez şablonu' : 'Kazuist makale şablonu',
    // Word asks to update the table of contents when the file opens; the entries fill from the headings.
    features: { updateFields: true },
    styles: stiller(d, tur),
    footnotes: {
      [DIPNOT_KAYNAK]: {
        children: [
          new Paragraph({
            style: 'FootnoteText',
            children: [new TextRun('[Örnek dipnot: kaynak künyesi ve sayfa numarası buraya yazılır.]')],
          }),
        ],
      },
      [DIPNOT_YAZAR]: {
        children: [
          new Paragraph({
            style: 'FootnoteText',
            children: [new TextRun('[Unvan, kurum, e-posta, ORCID: 0000-0000-0000-0000]')],
          }),
        ],
      },
    },
    sections,
  });
}

/**
 * Build the template as a ZIP byte array. The result is post-processed once: the table of contents styles
 * TOC 1-3 inherit Normal, so they get single spacing and no first line indent.
 */
export async function sablonUret(
  degerler: KuralDegerleri,
  tur: SablonTuru,
  secenek: UretimSecenekleri = {},
): Promise<Uint8Array> {
  const doc = tur === 'tez' ? tezBelgesi(degerler, secenek) : makaleBelgesi(degerler, secenek);
  const ham = new Uint8Array(await Packer.toArrayBuffer(doc));
  return icindekilerStilleriniDuzelt(ham);
}

const TOC_STIL = /(<w:style [^>]*w:styleId="TOC[123]"[^>]*>[\s\S]*?<w:pPr>)([\s\S]*?)(<\/w:pPr>)/g;

/** TOC 1-3 styles: remove the first line indent and justification they inherit from Normal. */
export function icindekilerStilleriniDuzelt(zip: Uint8Array): Uint8Array {
  const dosyalar = unzipSync(zip);
  const stil = dosyalar['word/styles.xml'];
  if (!stil) return zip;
  const yeni = strFromU8(stil).replace(TOC_STIL, (_m, bas: string, orta: string, son: string) => {
    const temiz = orta
      .replace(/<w:ind [^>]*firstLine="[^"]*"[^>]*\/>/g, '')
      .replace(/<w:spacing [^>]*\/>/g, '')
      .replace(/<w:jc [^>]*\/>/g, '');
    const girinti = /<w:ind /.test(temiz) ? '' : '<w:ind w:firstLine="0"/>';
    return `${bas}<w:spacing w:before="0" w:after="100" w:line="240" w:lineRule="auto"/>${girinti}${temiz}<w:jc w:val="left"/>${son}`;
  });
  dosyalar['word/styles.xml'] = strToU8(yeni);
  return zipSync(dosyalar, { level: 6 });
}

