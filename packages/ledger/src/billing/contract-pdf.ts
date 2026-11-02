import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import { verifyLegalSnapshot, type LegalSnapshot } from './contract-snapshot.ts';

export const CONTRACT_FONT_SIZE = 12;
const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 50;
const LEADING = 18;

function wrap(text: string, font: PDFFont): string[] {
  const lines: string[] = [];
  let line = '';
  // Character-level overflow also handles long email addresses and order identifiers without clipping.
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, CONTRACT_FONT_SIZE) <= WIDTH - 2 * MARGIN) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const char of word) {
      if (font.widthOfTextAtSize(line + char, CONTRACT_FONT_SIZE) > WIDTH - 2 * MARGIN) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  lines.push(line);
  return lines;
}

/** Renders only frozen, hash-verified text. Font size never shrinks below the legal 12 point minimum. */
export async function renderContractPdf(snapshot: LegalSnapshot, fontBytes: Uint8Array): Promise<Uint8Array> {
  if (!verifyLegalSnapshot(snapshot)) throw new Error('Invalid frozen legal document');
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const supported = new Set(font.getCharacterSet());
  for (const char of snapshot.text) {
    if (!/[\r\n\t]/.test(char) && !supported.has(char.codePointAt(0) ?? 0))
      throw new Error('Legal document contains a glyph the embedded font cannot render');
  }
  pdf.setTitle(`${snapshot.slug} - ${snapshot.orderId}`);
  pdf.setSubject(`Metin sürümü: ${snapshot.version}`);
  let page = pdf.addPage([WIDTH, HEIGHT]);
  let y = HEIGHT - MARGIN;
  for (const paragraph of snapshot.text.replace(/\r\n/g, '\n').split('\n')) {
    const lines = wrap(paragraph, font);
    const heading = /^\s*(?:#{1,6}\s|\d+\.\s)/.test(paragraph);
    // Keep short paragraphs together, and leave room after a numbered/Markdown heading.
    const needed = (lines.length + (heading ? 2 : 0)) * LEADING;
    if (needed < HEIGHT - 2 * MARGIN && y - needed < MARGIN) {
      page = pdf.addPage([WIDTH, HEIGHT]);
      y = HEIGHT - MARGIN;
    }
    for (const line of lines) {
      if (y < MARGIN + LEADING) {
        page = pdf.addPage([WIDTH, HEIGHT]);
        y = HEIGHT - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size: CONTRACT_FONT_SIZE, font, color: rgb(0.08, 0.1, 0.13) });
      y -= LEADING;
    }
  }
  const pages = pdf.getPages();
  for (const [index, p] of pages.entries())
    p.drawText(`${index + 1} / ${pages.length}`, { x: MARGIN, y: 25, size: CONTRACT_FONT_SIZE, font });
  return pdf.save();
}
