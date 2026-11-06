import { describe, expect, it } from 'vitest';
import {
  ayarlaDepo,
  bosDepo,
  calismaKuyrugu,
  degerlendir,
  denemeKaydet,
  depoyuOku,
  desteIlerlemesi,
  gunAnahtari,
  tekrarDestesineEkle,
  yanlisKartlar,
} from './depo.ts';

const T0 = new Date('2026-11-07T09:00:00Z');
const gunSonra = (n: number, saat = 9) => new Date(Date.UTC(2026, 10, 7 + n, saat, 0, 0));
const idler = Array.from({ length: 30 }, (_, i) => `deste.${String(i + 1).padStart(3, '0')}`);

describe('daily new card limit', () => {
  it('offers at most the daily limit of new cards and reports the rest as waiting', () => {
    const d = bosDepo(T0);
    const k = calismaKuyrugu(idler, d, T0);
    expect(k.yeni).toHaveLength(10);
    expect(k.yeniBekleyen).toBe(20);
    expect(k.tekrar).toEqual([]);
    expect(k.yeni[0]).toBe('deste.001');
  });

  it('counts the limit down as new cards are rated and lets the limit be changed', () => {
    let d = bosDepo(T0);
    for (const id of idler.slice(0, 4)) d = degerlendir(d, id, 3, T0);
    expect(calismaKuyrugu(idler, d, T0).yeni).toHaveLength(6);
    d = ayarlaDepo(d, { yeniKartSiniri: 0 });
    expect(calismaKuyrugu(idler, d, T0).yeni).toHaveLength(0);
    d = ayarlaDepo(d, { yeniKartSiniri: 50 });
    expect(calismaKuyrugu(idler, d, T0).yeni).toHaveLength(26);
  });

  it('never limits reviews: all due cards are offered even when the new card quota is used up', () => {
    let d = ayarlaDepo(bosDepo(T0), { yeniKartSiniri: 30 });
    for (const id of idler) d = degerlendir(d, id, 3, T0);
    d = ayarlaDepo(d, { yeniKartSiniri: 0 });
    const k = calismaKuyrugu(idler, d, gunSonra(40));
    expect(k.tekrar).toHaveLength(30);
    expect(k.yeni).toEqual([]);
  });

  it('starts a new day with a fresh new card quota', () => {
    let d = bosDepo(T0);
    for (const id of idler.slice(0, 10)) d = degerlendir(d, id, 3, T0);
    expect(calismaKuyrugu(idler, d, T0).yeni).toHaveLength(0);
    expect(calismaKuyrugu(idler, d, gunSonra(1)).yeni).toHaveLength(10);
  });
});

describe('due queue', () => {
  it('shows a card only from its due day and puts the most overdue first', () => {
    let d = bosDepo(T0);
    d = degerlendir(d, 'deste.001', 4, T0); // easy: long interval
    d = degerlendir(d, 'deste.002', 1, T0); // again: one day
    d = degerlendir(d, 'deste.003', 3, T0);
    expect(calismaKuyrugu(idler, d, T0).tekrar).toEqual([]);
    const yarin = calismaKuyrugu(idler, d, gunSonra(1)).tekrar;
    expect(yarin).toEqual(['deste.002']);
    const sonra = calismaKuyrugu(idler, d, gunSonra(60)).tekrar;
    expect(sonra).toHaveLength(3);
    expect(sonra[0]).toBe('deste.002');
  });

  it('puts a card rated Again back after at least one day', () => {
    const d = degerlendir(bosDepo(T0), 'deste.001', 1, T0);
    expect(d.kartlar['deste.001']?.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(d.kartlar['deste.001']?.lapses).toBe(0);
    const ikinci = degerlendir(d, 'deste.001', 1, gunSonra(1));
    expect(ikinci.kartlar['deste.001']?.lapses).toBe(1);
  });
});

describe('streak, progress and the wrong answer list', () => {
  it('counts consecutive days, keeps the day when studied twice and breaks after a missed day', () => {
    let d = degerlendir(bosDepo(T0), 'deste.001', 3, T0);
    d = degerlendir(d, 'deste.002', 3, T0);
    expect(d.seri).toEqual({ son: '2026-11-07', gun: 1, enUzun: 1 });
    d = degerlendir(d, 'deste.003', 3, gunSonra(1));
    expect(d.seri.gun).toBe(2);
    d = degerlendir(d, 'deste.004', 3, gunSonra(2));
    expect(d.seri).toEqual({ son: '2026-11-09', gun: 3, enUzun: 3 });
    d = degerlendir(d, 'deste.005', 3, gunSonra(5));
    expect(d.seri).toEqual({ son: '2026-11-12', gun: 1, enUzun: 3 });
  });

  it('uses the Turkish calendar day for the day key', () => {
    expect(gunAnahtari(new Date('2026-11-07T21:30:00Z'))).toBe('2026-11-08');
    expect(gunAnahtari(new Date('2026-11-07T20:30:00Z'))).toBe('2026-11-07');
  });

  it('summarises a deck and lists wrong answers, newest first', () => {
    let d = bosDepo(T0);
    d = degerlendir(d, 'deste.001', 3, T0);
    d = degerlendir(d, 'deste.002', 1, new Date(T0.getTime() + 1000));
    d = degerlendir(d, 'deste.003', 1, new Date(T0.getTime() + 2000));
    const o = desteIlerlemesi(idler.slice(0, 5), d, T0);
    expect(o).toMatchObject({ toplam: 5, yeni: 2, ogrenilen: 3, vadesiGelen: 0 });
    expect(o.basariOrani).toBeCloseTo(1 / 3, 5);
    expect(yanlisKartlar(d)).toEqual(['deste.003', 'deste.002']);
  });
});

describe('repeat deck after an exam', () => {
  it('rates the cards Again without using up the daily new card quota', () => {
    const d = tekrarDestesineEkle(bosDepo(T0), ['deste.001', 'deste.002'], T0);
    expect(Object.keys(d.kartlar)).toEqual(['deste.001', 'deste.002']);
    expect(d.kartlar['deste.001']?.sonDerece).toBe(1);
    expect(d.gunluk.yeni).toBe(0);
    expect(calismaKuyrugu(idler, d, T0).yeni).toHaveLength(10);
    expect(calismaKuyrugu(idler, d, gunSonra(1)).tekrar).toEqual(['deste.001', 'deste.002']);
    expect(yanlisKartlar(d)).toHaveLength(2);
  });
});

describe('stored value', () => {
  it('survives a round trip through JSON', () => {
    let d = degerlendir(bosDepo(T0), 'deste.001', 3, T0);
    d = denemeKaydet(d, {
      tarih: T0.toISOString(),
      soruSayisi: 6,
      dogru: 4,
      puan: 66.7,
      tam: false,
      gecenDakika: 12,
      baraj: false,
      alanlar: { 'medeni-hukuk': { dogru: 4, toplam: 6 } },
    });
    expect(depoyuOku(JSON.stringify(d), T0)).toEqual(d);
  });

  it('turns damaged, foreign or empty storage into an empty store instead of failing', () => {
    expect(depoyuOku(null, T0).kartlar).toEqual({});
    expect(depoyuOku('{bozuk', T0).kartlar).toEqual({});
    expect(depoyuOku(JSON.stringify({ surum: 2 }), T0).kartlar).toEqual({});
    const d = degerlendir(bosDepo(T0), 'deste.001', 3, T0);
    const bozuk = JSON.stringify({ ...d, kartlar: { x: { due: 'yarın' } } });
    expect(depoyuOku(bozuk, T0).kartlar).toEqual({});
  });
});
