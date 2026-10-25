import { describe, expect, it } from 'vitest';
import { createLegalSnapshot, verifyLegalSnapshot } from '../../src/billing/contract-snapshot.ts';

const input = () => ({
  orderId: '00000000-0000-4000-8000-000000000001',
  slug: 'mesafeli-satis' as const,
  acceptedVersion: '2026-10-25.1',
  frontMatter: {
    title: 'Test sözleşmesi',
    slug: 'mesafeli-satis',
    route: '/hukuki/mesafeli-satis',
    lang: 'tr',
    binding: true,
    version: '2026-10-25.1',
    date: '2026-10-25',
    status: 'yayinda',
    pdf: true,
    pdf_fields: ['ALICI_AD', 'TUTAR_TL'],
  },
  body: '# Test sözleşmesi\n\nAlıcı: {{ALICI_AD}}\nTutar: {{TUTAR_TL}} TL',
  fields: { ALICI_AD: 'Çağrı Özgür', TUTAR_TL: '349,00' },
});

describe('immutable legal snapshot preparation', () => {
  it('freezes accepted version and order fields without following subsequent source mutations', () => {
    const source = input();
    const snapshot = createLegalSnapshot(source);
    source.fields.TUTAR_TL = '999,00';
    source.body = 'new version';
    expect(snapshot.text).toContain('349,00 TL');
    expect(snapshot.text).toContain('Çağrı Özgür');
    expect(snapshot.text).toContain('Metin sürümü: 2026-10-25.1');
    expect(snapshot.text).toContain(source.orderId);
    expect(snapshot.fields.TUTAR_TL).toBe('349,00');
    expect(verifyLegalSnapshot(snapshot)).toBe(true);
    expect(verifyLegalSnapshot({ ...snapshot, text: `${snapshot.text} altered` })).toBe(false);
  });

  it('fails closed for draft, company placeholders, missing values and a different accepted version', () => {
    const source = input();
    expect(() =>
      createLegalSnapshot({ ...source, frontMatter: { ...source.frontMatter, status: 'taslak' } }),
    ).toThrow();
    expect(() => createLegalSnapshot({ ...source, body: `${source.body}\n{{MERSIS}}` })).toThrow();
    expect(() => createLegalSnapshot({ ...source, fields: { ...source.fields, ALICI_AD: '' } })).toThrow();
    expect(() => createLegalSnapshot({ ...source, acceptedVersion: '2026-10-24.1' })).toThrow();
    expect(() => createLegalSnapshot({ ...source, body: `${source.body}\n[DOĞRULANACAK: künye]` })).toThrow();
  });
});
