import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { dosyaAdi, taslakDocx, type PmDugum } from '../docx-aktar.ts';

const govde: PmDugum = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Giriş' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'İşveren ' },
        { type: 'text', text: 'denetimi', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' sınırlıdır.', marks: [{ type: 'italic' }] },
      ],
    },
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bir' }] }] },
      ],
    },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alıntı' }] }] },
    { type: 'paragraph' },
  ],
};

describe('taslakDocx', () => {
  it('writes the title, headings, marks, lists, quotes and page numbers', async () => {
    const zip = unzipSync(await taslakDocx(govde, 'Çalışma başlığı'));
    const xml = strFromU8(zip['word/document.xml'] ?? new Uint8Array());
    expect(xml).toContain('Çalışma başlığı');
    expect(xml).toContain('w:val="Bolum1"');
    expect(xml).toContain('Giriş');
    expect(xml).toMatch(/<w:b\/>[\s\S]*?denetimi/);
    expect(xml).toMatch(/<w:i\/>[\s\S]*?sınırlıdır/);
    expect(xml).toContain('<w:numPr>');
    expect(xml).not.toContain('<w:b w:val="false"/>');
    expect(xml).toContain('w:val="Alinti"');
    const footer = Object.keys(zip).find((k) => k.startsWith('word/footer'));
    expect(strFromU8(zip[footer ?? ''] ?? new Uint8Array())).toContain('PAGE');
    expect(strFromU8(zip['docProps/core.xml'] ?? new Uint8Array())).toContain('Çalışma başlığı');
  });

  it('works without a title', async () => {
    const xml = strFromU8(
      unzipSync(await taslakDocx({ type: 'doc' }, ''))['word/document.xml'] ?? new Uint8Array(),
    );
    expect(xml).not.toContain('w:val="Baslik"');
  });
});

describe('dosyaAdi', () => {
  it('keeps Turkish letters and drops unsafe characters', () => {
    expect(dosyaAdi('İşveren: denetim / sınır?')).toBe('İşveren denetim  sınır.docx');
    expect(dosyaAdi('  ')).toBe('kazuist-taslak.docx');
  });
});
