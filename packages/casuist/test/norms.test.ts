import { describe, expect, it } from 'vitest';
import { LAWS } from '../src/laws.ts';
import { formatNorm, normMatches, resolveNorms } from '../src/norms.ts';

const n = (kanunNo: string, madde: string, fikra: string | null = null, bent: string | null = null) =>
  expect.objectContaining({ kanunNo, madde, fikra, bent });

describe('norm resolver (plan 7.1/1)', () => {
  it.each([
    ['KVKK m.11', n('6698', '11')],
    ['6698 s. Kanun m. 11/1-c', n('6698', '11', '1', 'c')],
    ['TBK 49', n('6098', '49')],
    ["Türk Borçlar Kanunu'nun 49. maddesi", n('6098', '49')],
    ['GDPR Art. 17', n('GDPR', '17')],
    ['kvkk madde 7', n('6698', '7')],
    ['KVKK md. 7', n('6698', '7')],
    ["KVKK'nın 11. maddesinin 1. fıkrasının (c) bendi", n('6698', '11', '1', 'c')],
    ['6698 sayılı Kanun’un 11 inci maddesi', n('6698', '11')],
    ['6698 sayılı Kişisel Verilerin Korunması Kanunu madde 5', n('6698', '5')],
    ['Art. 17(1)(a) GDPR', n('GDPR', '17', '1', 'a')],
    ['Anayasa m.20/3', n('2709', '20', '3')],
    ['AY m. 90', n('2709', '90')],
    ['İİK 89', n('2004', '89')],
    ['TCK m.136', n('5237', '136')],
  ])('%s', (input, expected) => {
    expect(resolveNorms(input)).toEqual([expected]);
  });

  it('keeps the law name of the alias table', () => {
    expect(resolveNorms('KVKK m.11')[0]?.kanunAdi).toBe('Kişisel Verilerin Korunması Kanunu');
  });

  it('does not read years, months or plain words as articles', () => {
    expect(resolveNorms('KVKK 2016 yılında yürürlüğe girdi')).toEqual([]);
    expect(resolveNorms('3 ay içinde başvuru')).toEqual([]);
    expect(resolveNorms('anayasa mahkemesi kararı')).toEqual([]);
  });

  it('drops a bare duplicate of a finer reference and keeps the rest in order of appearance', () => {
    const out = resolveNorms('KVKK m.11 ve TBK 49 ile KVKK m. 11/1-c birlikte');
    expect(out.map(formatNorm)).toEqual(['TBK m.49', 'KVKK m.11/1-c']);
  });

  it('formats references', () => {
    expect(formatNorm({ kanunNo: '6698', madde: '11', fikra: '1', bent: 'c' })).toBe('KVKK m.11/1-c');
    expect(formatNorm({ kanunNo: '4857', madde: '18', fikra: null, bent: null })).toBe('4857 s. Kanun m.18');
    expect(formatNorm({ kanunNo: 'GDPR', madde: '17', fikra: '1', bent: 'a' })).toBe('GDPR Art. 17(1)(a)');
  });

  it('matches record norms on law and article, finer parts only when both have them', () => {
    expect(
      normMatches(
        { kanunNo: '6698', madde: '11', fikra: null },
        { kanunNo: '6698', madde: '11', fikra: '1' },
      ),
    ).toBe(true);
    expect(
      normMatches({ kanunNo: '6698', madde: '11', fikra: '2' }, { kanunNo: '6698', madde: '11', fikra: '1' }),
    ).toBe(false);
    expect(
      normMatches(
        { kanunNo: '6698', madde: '11', fikra: null },
        { kanunNo: '6098', madde: '11', fikra: null },
      ),
    ).toBe(false);
  });

  it('has unique law numbers and aliases', () => {
    expect(new Set(LAWS.map((l) => l.no)).size).toBe(LAWS.length);
    const aliases = LAWS.flatMap((l) => l.takma);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});
