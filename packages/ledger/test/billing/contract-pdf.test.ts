import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { CONTRACT_FONT_SIZE, renderContractPdf } from '../../src/billing/contract-pdf.ts';

// Relative to test/billing, the repository font is two more levels up.
const fontBytes = () =>
  readFile(
    new URL(
      '../../assets/fonts/DejaVuSans.ttf',
      new URL('../../src/billing/contract-pdf.ts', import.meta.url),
    ),
  );
const text = 'Metin sürümü: 2026-10-25.1\nSipariş: test\nÇağrı Özgür, İğdır Şişli, 349,00 TL\n';
const snapshot = (body = text) => ({
  orderId: 'test',
  slug: 'mesafeli-satis' as const,
  version: '2026-10-25.1',
  fields: {},
  text: body,
  sha256: createHash('sha256').update(body).digest('hex'),
});

describe('contract PDF', () => {
  it('embeds Turkish glyphs at a minimum 12 points and paginates long frozen documents', async () => {
    expect(CONTRACT_FONT_SIZE).toBe(12);
    const pdf = await PDFDocument.load(await renderContractPdf(snapshot(text.repeat(80)), await fontBytes()));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toBe('mesafeli-satis - test');
  });
  it('rejects corrupt frozen text before rendering', async () => {
    await expect(renderContractPdf({ ...snapshot(), sha256: 'bad' }, await fontBytes())).rejects.toThrow();
  });
});
