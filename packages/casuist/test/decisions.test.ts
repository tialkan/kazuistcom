import { describe, expect, it } from 'vitest';
import { decisionKey, resolveDecisions } from '../src/decisions.ts';

describe('decision resolver (plan 6.5 patterns)', () => {
  it('reads E. K. T. with a chamber in front', () => {
    expect(resolveDecisions('HGK E. 2013/19-199 K. 2013/1418 T. 13.11.2013')).toEqual([
      expect.objectContaining({
        kind: 'yargi',
        court: 'Yargıtay',
        chamber: 'Hukuk Genel Kurulu',
        esasNo: '2013/19-199',
        kararNo: '2013/1418',
      }),
    ]);
  });
  it('reads "4. HD 2021/26076 E., 2024/10643 K."', () => {
    expect(resolveDecisions('4. HD 2021/26076 E., 2024/10643 K.')).toEqual([
      expect.objectContaining({ chamber: '4. Hukuk Dairesi', esasNo: '2021/26076', kararNo: '2024/10643' }),
    ]);
  });
  it('reads the "tarih ve sayılı kararı" form with its date', () => {
    expect(
      resolveDecisions("HGK'nın 13.11.2013 tarih ve 2013/19-199 E., 2013/1418 K. sayılı kararı"),
    ).toEqual([
      expect.objectContaining({ chamber: 'Hukuk Genel Kurulu', date: '2013-11-13', esasNo: '2013/19-199' }),
    ]);
  });
  it('reads bare numbers with a trailing date', () => {
    expect(resolveDecisions('E. 2014/4-56 K. 2015/1679 T. 1.6.2015')).toEqual([
      expect.objectContaining({
        esasNo: '2014/4-56',
        kararNo: '2015/1679',
        date: '2015-06-01',
        chamber: null,
      }),
    ]);
  });
  it('reads a criminal chamber and Yargıtay from context', () => {
    expect(resolveDecisions('Yargıtay 12. Ceza Dairesi E. 2019/14037 K. 2022/2232')[0]).toMatchObject({
      court: 'Yargıtay',
      chamber: '12. Ceza Dairesi',
    });
  });
  it('reads AYM, ABAD and AİHM numbers', () => {
    expect(resolveDecisions('AYM B. No: 2014/1234')[0]).toMatchObject({
      kind: 'aym_bireysel',
      number: '2014/1234',
    });
    expect(resolveDecisions('C-131/12 Google Spain')[0]).toMatchObject({ kind: 'abad', number: 'C-131/12' });
    expect(resolveDecisions('application no. 12345/09')[0]).toMatchObject({
      kind: 'aihm',
      number: '12345/09',
    });
  });
  it('rejects impossible dates and finds nothing in plain text', () => {
    expect(resolveDecisions('E. 2014/4-56 K. 2015/1679 T. 45.13.2015')[0]?.date).toBeNull();
    expect(resolveDecisions('kişisel verilerin silinmesi')).toEqual([]);
  });
  it('normalises numbers for matching', () => {
    expect(decisionKey('2013 / 19-199')).toBe('2013/19-199');
    expect(decisionKey(null)).toBe('');
  });
});
