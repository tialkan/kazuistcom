import { describe, expect, it } from 'vitest';
import { lowerTr, ortak, sayiTr, upperTr } from '../src/index.ts';

describe('Turkish case mapping (plan 12.4, 12.10)', () => {
  it('maps every Turkish letter pair both ways', () => {
    expect(upperTr('iışğçöü')).toBe('İIŞĞÇÖÜ');
    expect(lowerTr('İIŞĞÇÖÜ')).toBe('iışğçöü');
    expect(upperTr('İıŞşĞğÇçÖöÜü')).toBe('İIŞŞĞĞÇÇÖÖÜÜ');
    expect(lowerTr('İıŞşĞğÇçÖöÜü')).toBe('iışşğğççööüü');
  });
  it('differs from the locale-free mapping exactly where Turkish needs it', () => {
    expect('i'.toUpperCase()).toBe('I');
    expect(upperTr('i')).toBe('İ');
    expect(lowerTr('I')).toBe('ı');
  });
  it('round-trips real words', () => {
    for (const w of ['ılık', 'istinaf', 'şerh', 'Yargıtay', 'içtihadı birleştirme', 'Üsküdar']) {
      expect(lowerTr(upperTr(w))).toBe(lowerTr(w));
    }
    expect(upperTr('İstanbul Üniversitesi')).toBe('İSTANBUL ÜNİVERSİTESİ');
  });
});

describe('number formatting', () => {
  it('uses Turkish separators', () => {
    expect(sayiTr(1000)).toBe('1.000');
    expect(sayiTr(0.13, 3)).toBe('0,130');
  });
});

describe('proper names are not translated (wt.88)', () => {
  it('keeps brand and company names identical in en', () => {
    expect(ortak('en').marka).toBe(ortak('tr').marka);
    expect(ortak('en').altBilgi.telif).toBe(ortak('tr').altBilgi.telif);
  });
  it('has no Turkuaz Kampus key after ADR-0031', () => {
    for (const dil of ['tr', 'en'] as const) {
      expect(JSON.stringify(ortak(dil))).not.toMatch(/kampus|Kampüs/i);
    }
  });
  it('keeps the fixed warnings in the source text required by plan 7.5', () => {
    expect(ortak('tr').uyari.intihal).toBe('Kazuist intihale ve etik ihlaline aracılık etmez.');
    expect(ortak('tr').uyari.danismanlik).toBe(
      'Kazuist hukuki danışmanlık vermez ve kişisel durumunuz için görüş bildirmez.',
    );
    expect(ortak('tr').amac).toBe(
      'Hukuk kaynağını bulun, dayanağını görün, metninizi kurallarına uygun yazın.',
    );
  });
});
