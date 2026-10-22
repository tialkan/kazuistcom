import { describe, expect, it } from 'vitest';
import { scrub } from '../src/index.ts';

// Quality gate O-03: separator and case variants must be masked; checksums still guard false positives.
describe('PII format variants', () => {
  it.each([
    ['tckn spaced', '100 000 001 46', 'KİMLİK NO'],
    ['tckn dotted', '100.000.001.46', 'KİMLİK NO'],
    ['tckn dashed', '100-000-001-46', 'KİMLİK NO'],
    ['tckn line break', '1000000\n0146', 'KİMLİK NO'],
    ['iban lower compact', 'tr330006100519786457841326', 'IBAN'],
    ['iban lower spaced', 'tr33 0006 1005 1978 6457 8413 26', 'IBAN'],
    ['iban dashed', 'TR33-0006-1005-1978-6457-8413-26', 'IBAN'],
    ['iban line break', 'TR33 0006 1005\n1978 6457 8413 26', 'IBAN'],
    ['phone dotted', '0532.123.45.67', 'TELEFON'],
    ['phone dashed', '0532-123-45-67', 'TELEFON'],
    ['phone +90 dotted', '+90.532.123.45.67', 'TELEFON'],
    ['phone line break', '0532 123\n45 67', 'TELEFON'],
    ['landline dotted', '0312.123.45.67', 'TELEFON'],
    ['card dotted', '4111.1111.1111.1111', 'KART'],
  ])('%s', async (_n, value, label) => {
    const r = await scrub(`Bilgi: ${value} kayıtlıdır.`);
    expect(r.text).toBe(`Bilgi: [${label}-1] kayıtlıdır.`);
  });

  it.each([
    'E. 2023/1234 K. 2024/5678',
    '12.03.2024 tarihli karar',
    'numara 100 000 001 47',
    'tr33 0006 1005 1978 6457 8413 27',
    '4111.1111.1111.1112',
    'Kanun m. 11/1-c ve 5237 sayılı TCK',
    'tutar 1.250.000,00 TL',
    'Resmî Gazete 30.06.2024 sayı 32588',
    // Plates stay upper case only: lower case would hit ordinary text like this.
    'madde 16 ve 25 birlikte',
  ])('leaves %s untouched', async (t) => {
    expect((await scrub(t)).text).toBe(t);
  });
});
