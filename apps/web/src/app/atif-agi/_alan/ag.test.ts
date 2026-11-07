import { describe, expect, it } from 'vitest';
import {
  bagliIdler,
  cizgiler,
  cokAtifAlanIdleri,
  disAtifEtiketi,
  eserAtifSayilari,
  eserKomsulari,
  eserYillari,
  kararKomsulari,
  kararlariSirala,
  kunye,
  metniAcSorgusu,
  ozetle,
} from './ag.ts';
import { sentetikAg } from './test-verisi.ts';
import { FiltreSemasi, tarihAraligi } from './tipler.ts';

const ilk = <T>(liste: T[]): T => {
  const v = liste[0];
  if (v === undefined) throw new Error('empty list');
  return v;
};

describe('graph functions', () => {
  const ag = sentetikAg();

  it('counts the distinct decisions that cite each work (FR-28)', () => {
    const s = eserAtifSayilari(ag);
    expect([...s]).toEqual([
      ['e1', 6],
      ['e2', 2],
      ['e3', 1],
      ['e4', 1],
    ]);
  });

  it('marks only the works with the highest count, and only when more than one decision cites them', () => {
    expect([...cokAtifAlanIdleri(ag)]).toEqual(['e1']);
    const tek = sentetikAg(1, 1);
    expect(cokAtifAlanIdleri(tek).size).toBe(0);
    expect(ozetle(tek).enCokAtifAlanlar).toEqual([]);
  });

  it('summary cards (FR-27)', () => {
    const o = ozetle(ag);
    expect(o).toMatchObject({ kararSayisi: 6, eserSayisi: 4, doktrinAtfiSayisi: 10, kararAtfiSayisi: 2 });
    expect(o.enCokAtifAlanlar).toEqual([{ id: 'e1', baslik: 'Sentetik eser 1', sayi: 6 }]);
  });

  it('lists the neighbours of a decision (FR-29): works, cited decisions, citing decisions', () => {
    const k = kararKomsulari(ag, 'k2');
    expect(k.eserler.map((x) => x.eser.id)).toEqual(['e1', 'e2']);
    expect(k.eserler[1]?.sayfalar).toEqual(['7']);
    expect(k.atifYaptigiKararlar.map((x) => x.id)).toEqual(['k1']);
    expect(kararKomsulari(ag, 'k1').atifYapanKararlar.map((x) => x.id)).toEqual(['k2']);
    expect(kararKomsulari(ag, 'k1').atifYaptigiDisKararlar).toHaveLength(1);
    expect(eserKomsulari(ag, 'e2').kararlar.map((x) => x.karar.id)).toEqual(['k1', 'k2']);
  });

  it('highlight set and drawn lines follow the selection', () => {
    expect([...bagliIdler(ag, { tur: 'karar', id: 'k3' })].sort()).toEqual(['e1', 'e3']);
    expect([...bagliIdler(ag, { tur: 'eser', id: 'e2' })].sort()).toEqual(['k1', 'k2']);
    expect(bagliIdler(ag, null).size).toBe(0);
    const ids = new Set(['k1', 'k2']);
    expect(cizgiler(ag, ids, new Set(['e2'])).map((e) => `${e.from}>${e.work}`)).toEqual(['k1>e2', 'k2>e2']);
  });

  it('orders decisions by how much they cite, then newest, deterministically', () => {
    const s = kararlariSirala(ag).map((k) => k.id);
    expect(s.slice(0, 2)).toEqual(['k2', 'k1']); // both cite three things; k2 is the newer one
    expect(kararlariSirala(ag).map((k) => k.id)).toEqual(s);
  });

  it('labels', () => {
    expect(kunye(ilk(ag.nodes))).toBe('Hukuk Genel Kurulu E. 2014/1-10 K. 2015/100');
    expect(metniAcSorgusu(ilk(ag.nodes))).toBe('E. 2014/1-10 K. 2015/100');
    expect(disAtifEtiketi(ilk(ag.externalCitations))).toBe('Hukuk Genel Kurulu E. 2013/19-199 K. 2013/1418');
    expect(
      disAtifEtiketi({
        from: 'x',
        tur: 'abad',
        mahkeme: 'ABAD',
        daire: null,
        esasNo: null,
        kararNo: null,
        numara: 'C-131/12',
        tarih: null,
      }),
    ).toBe('ABAD C-131/12');
    expect(eserYillari(ilk(ag.works))).toEqual([1990]);
  });
});

describe('filter schema', () => {
  it('accepts court, chamber, topic and a year or a date; rejects unknown keys and bad years', () => {
    expect(FiltreSemasi.safeParse({ court: 'Yargıtay', from: '2013', to: '2015-12-31' }).success).toBe(true);
    expect(FiltreSemasi.safeParse({ from: '13' }).success).toBe(false);
    expect(FiltreSemasi.safeParse({ from: '2015-13-45' }).success).toBe(false);
    expect(FiltreSemasi.safeParse({ court: 'x'.repeat(81) }).success).toBe(false);
    expect(FiltreSemasi.safeParse({ unknown: '1' }).success).toBe(false);
  });
  it('expands a year to the first and last day', () => {
    expect(tarihAraligi({ from: '2013', to: '2015' })).toEqual({ from: '2013-01-01', to: '2015-12-31' });
    expect(tarihAraligi({ from: '2013-05-02' })).toEqual({ from: '2013-05-02' });
    expect(tarihAraligi({})).toEqual({});
  });
});
