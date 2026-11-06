import { describe, expect, it } from 'vitest';
import {
  fold,
  normalize,
  stem,
  stripApostropheSuffix,
  terms,
  tokens,
  wordCount,
  words,
} from '../src/normalize.ts';

describe('normalize (Ek D.2)', () => {
  it('applies NFC and Turkish lower casing', () => {
    // Decomposed "I" + combining dot above becomes the precomposed İ, then i.
    expect(normalize('I' + String.fromCodePoint(0x307) + 'STANBUL')).toBe('istanbul');
    expect(normalize('İSTANBUL ILIK')).toBe('istanbul ılık');
  });
  it('unifies quotes, apostrophes and dashes, drops soft hyphens and zero width marks', () => {
    const c = (n: number): string => String.fromCodePoint(n);
    expect(normalize('KVKK' + c(0x2019) + 'nın ' + c(0x201c) + 'açık' + c(0x201d) + ' rıza')).toBe(
      'kvkk\'nın "açık" rıza',
    );
    expect(normalize('m. 11/1' + c(0x2013) + 'c')).toBe('m. 11/1-c');
    expect(normalize('m. 11/1' + c(0x2014) + 'c')).toBe('m. 11/1-c');
    expect(normalize('ki' + c(0xad) + 'şi' + c(0x200b) + 'sel')).toBe('kişisel');
  });
  it('collapses whitespace including non-breaking spaces and line breaks', () => {
    expect(normalize('  bir' + String.fromCodePoint(0xa0) + '\n\t iki  ')).toBe('bir iki');
  });
  it('folds Turkish letters for spelling tolerant search', () => {
    expect(fold('Özel Nitelikli Kişisel Veri ŞÜĞ âîû')).toBe('ozel nitelikli kisisel veri sug aiu');
  });
  it('drops inflection after an apostrophe', () => {
    expect(stripApostropheSuffix("kvkk'nın 6698'e yargıtay'ın")).toBe('kvkk 6698 yargıtay');
  });
  it('stems to five letters and keeps numbers', () => {
    expect(stem('verilerin')).toBe('veril');
    expect(stem('veri')).toBe('veri');
    expect(stem('2024')).toBe('2024');
  });
  it('tokenises and removes stop words', () => {
    expect(tokens("KVKK'nın 11. maddesi ve silme")).toEqual(['kvkk', '11', 'maddesi', 've', 'silme']);
    expect(terms("KVKK'nın 11. maddesi ve silme")).toEqual(['kvkk', '11', 'madde', 'silme']);
    expect(words('Özel NİTELİKLİ veri')).toEqual(['özel', 'nitelikli', 'veri']);
  });
  it('counts words the way the 70 word limit expects', () => {
    expect(wordCount('KVKK m.11/1-c uyarınca, ilgili kişi bilgi talep edebilir.')).toBe(8);
    expect(wordCount('')).toBe(0);
  });
});
