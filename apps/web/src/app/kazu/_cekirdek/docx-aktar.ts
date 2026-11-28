import {
  AlignmentType,
  Document,
  Footer,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  type IParagraphOptions,
} from 'docx';

/**
 * Word export of the /kazu draft (ADR-0040: Word through the `docx` library). Turns the editor's ProseMirror
 * JSON into a plain academic document: A4, 2.5 cm margins, Times New Roman 12 pt, 1.5 lines, justified body with
 * a first line indent, page numbers at the bottom. Journal and university profiles come later as rule packs.
 * Runs in the browser; the text never leaves the device.
 */

export interface PmDugum {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmDugum[];
  text?: string;
  marks?: { type: string }[];
}

const cm = (n: number) => Math.round(n * 567);
const NUMARALI = 'kazu-numarali';
const MADDE = 'kazu-madde';

function satirlar(d: PmDugum | undefined, ek: { italik?: boolean } = {}): TextRun[] {
  const out: TextRun[] = [];
  for (const c of d?.content ?? []) {
    if (c.type === 'text') {
      const m = new Set((c.marks ?? []).map((x) => x.type));
      // only set marks that are on: an explicit "false" would override the paragraph style (bold headings)
      out.push(
        new TextRun({
          text: c.text ?? '',
          ...(m.has('bold') ? { bold: true } : {}),
          ...(m.has('italic') || ek.italik ? { italics: true } : {}),
        }),
      );
    } else if (c.type === 'hardBreak') out.push(new TextRun({ break: 1 }));
  }
  return out;
}

function bloklar(dugumler: PmDugum[], liste?: { ref: string; seviye: number }): Paragraph[] {
  const out: Paragraph[] = [];
  for (const d of dugumler) {
    switch (d.type) {
      case 'heading': {
        const seviye = Number(d.attrs?.level ?? 2);
        out.push(
          new Paragraph({
            style: seviye <= 2 ? 'Bolum1' : 'Bolum2',
            children: satirlar(d),
          }),
        );
        break;
      }
      case 'paragraph': {
        const o: IParagraphOptions = { children: satirlar(d) };
        out.push(
          new Paragraph(
            liste
              ? { ...o, numbering: { reference: liste.ref, level: liste.seviye } }
              : { ...o, style: 'Govde' },
          ),
        );
        break;
      }
      case 'blockquote':
        for (const p of d.content ?? []) out.push(new Paragraph({ style: 'Alinti', children: satirlar(p) }));
        break;
      case 'bulletList':
      case 'orderedList': {
        const ref = d.type === 'bulletList' ? MADDE : NUMARALI;
        const seviye = liste ? Math.min(liste.seviye + 1, 2) : 0;
        for (const li of d.content ?? []) out.push(...bloklar(li.content ?? [], { ref, seviye }));
        break;
      }
      default:
        if (d.content) out.push(...bloklar(d.content, liste));
    }
  }
  return out;
}

/** Build the .docx bytes for a draft. */
export async function taslakDocx(govde: PmDugum, baslik: string): Promise<Uint8Array> {
  const metin = { font: 'Times New Roman', size: 24 };
  const doc = new Document({
    title: baslik,
    creator: 'Kazuist',
    styles: {
      default: {
        document: { run: metin, paragraph: { spacing: { line: 360, lineRule: LineRuleType.AUTO } } },
      },
      paragraphStyles: [
        {
          id: 'Govde',
          name: 'Gövde',
          basedOn: 'Normal',
          paragraph: {
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: cm(1.25) },
            spacing: { after: 120 },
          },
        },
        {
          id: 'Alinti',
          name: 'Blok alıntı',
          basedOn: 'Normal',
          run: { size: 22 },
          paragraph: { indent: { left: cm(1.25), right: cm(1.25) }, spacing: { line: 240, after: 120 } },
        },
        {
          id: 'Bolum1',
          name: 'Bölüm başlığı 1',
          basedOn: 'Normal',
          next: 'Govde',
          run: { bold: true, color: '000000' },
          paragraph: { spacing: { before: 360, after: 120 }, keepNext: true, outlineLevel: 0 },
        },
        {
          id: 'Bolum2',
          name: 'Bölüm başlığı 2',
          basedOn: 'Normal',
          next: 'Govde',
          run: { bold: true, italics: true, color: '000000' },
          paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 },
        },
        {
          id: 'Baslik',
          name: 'Çalışma başlığı',
          basedOn: 'Normal',
          run: { bold: true, size: 28 },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 360 } },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: NUMARALI,
          levels: [0, 1, 2].map((level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level],
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: cm(1.25 * (level + 1)), hanging: cm(0.63) } } },
          })),
        },
        {
          reference: MADDE,
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.BULLET,
            text: ['•', '◦', '▪'][level] ?? '•',
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: cm(1.25 * (level + 1)), hanging: cm(0.63) } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: cm(2.5), right: cm(2.5), bottom: cm(2.5), left: cm(2.5) },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT] })],
              }),
            ],
          }),
        },
        children: [
          ...(baslik ? [new Paragraph({ style: 'Baslik', children: [new TextRun(baslik)] })] : []),
          ...bloklar(govde.content ?? []),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

/** File name from the title: Turkish letters kept, unsafe characters dropped. */
export function dosyaAdi(baslik: string): string {
  const yasak = '\\/:*?"<>|';
  const temiz = [...baslik]
    .filter((ch) => ch.charCodeAt(0) > 31 && !yasak.includes(ch))
    .join('')
    .trim()
    .slice(0, 80);
  return `${temiz || 'kazuist-taslak'}.docx`;
}
