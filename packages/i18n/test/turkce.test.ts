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

describe('shared dictionary content', () => {
  it('has no Turkuaz Kampus key after ADR-0031', () => {
    expect(JSON.stringify(ortak())).not.toMatch(/kampus|Kampüs/i);
  });
  it('has no English page link or English note after ADR-0032', () => {
    const metin = JSON.stringify(ortak());
    expect(metin).not.toMatch(/English|"\/en"|casuistEn|enNotu/);
  });
  it('keeps the fixed warnings in the source text required by plan 7.5', () => {
    expect(ortak().uyari.intihal).toBe('Kazuist intihale ve etik ihlaline aracılık etmez.');
    expect(ortak().uyari.danismanlik).toBe(
      'Kazuist hukuki danışmanlık vermez ve kişisel durumunuz için görüş bildirmez.',
    );
    expect(ortak().amac).toBe('Hukuk kaynağını bulun, dayanağını görün, metninizi kurallarına uygun yazın.');
  });
});
