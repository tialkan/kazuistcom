import { describe, expect, it } from 'vitest';
import { bosDepo, depoyuOku } from './depo.ts';
import { denemeKur } from './deneme.ts';
import { denemeyiBitir, denemeyiOku, sureBittiMi, yeniDeneme } from './deneme-oturumu.ts';
import { sentetikHavuz } from './test-verisi.ts';

const havuz = sentetikHavuz();
const T0 = Date.UTC(2026, 10, 7, 9, 0, 0);

describe('running exam in the browser', () => {
  const plan = denemeKur(havuz, 99);
  const s = yeniDeneme(plan, 99, T0);

  it('starts with every answer blank and the first question', () => {
    expect(s.idler).toHaveLength(120);
    expect(s.cevaplar.every((c) => c === null)).toBe(true);
    expect(s.isaretler.every((x) => !x)).toBe(true);
    expect(s.sira).toBe(0);
  });

  it('is read back as the same exam when the pool is unchanged', () => {
    const geri = denemeyiOku(
      JSON.stringify({ ...s, cevaplar: s.cevaplar.map((_, i) => (i === 0 ? 2 : null)) }),
      havuz,
    );
    expect(geri?.plan.sorular.map((q) => q.id)).toEqual(plan.sorular.map((q) => q.id));
    expect(geri?.saklanan.cevaplar[0]).toBe(2);
  });

  it('is dropped, not guessed, when it is damaged or the pool changed', () => {
    expect(denemeyiOku(null, havuz)).toBeNull();
    expect(denemeyiOku('{bozuk', havuz)).toBeNull();
    expect(denemeyiOku(JSON.stringify({ tohum: 1 }), havuz)).toBeNull();
    expect(denemeyiOku(JSON.stringify(s), havuz.slice(5))).toBeNull();
    expect(denemeyiOku(JSON.stringify({ ...s, cevaplar: [null] }), havuz)).toBeNull();
  });

  it('ends exactly at 155 minutes of wall time', () => {
    expect(sureBittiMi(s, plan, T0 + 154 * 60_000)).toBe(false);
    expect(sureBittiMi(s, plan, T0 + 155 * 60_000)).toBe(true);
  });

  it('writes the result to the history and drops wrong and blank cards into the repeat deck without using the new card quota', () => {
    const cevaplar = plan.sorular.map((q, i) =>
      i < 90 ? q.dogruIndex : i < 100 ? (q.dogruIndex + 1) % 5 : null,
    );
    const son = T0 + 100 * 60_000;
    const r = denemeyiBitir(bosDepo(new Date(T0)), plan, { ...s, cevaplar }, son);
    expect(r.sonuc).toMatchObject({ dogru: 90, yanlis: 10, bos: 20, baraj: true });
    expect(r.sonuc.puan).toBeCloseTo(75, 10);
    expect(r.gecenDakika).toBeCloseTo(100, 6);
    expect(r.depo.denemeler).toHaveLength(1);
    expect(r.depo.denemeler[0]).toMatchObject({ soruSayisi: 120, dogru: 90, tam: true, baraj: true });
    expect(Object.keys(r.depo.kartlar)).toHaveLength(30);
    expect(r.depo.gunluk.yeni).toBe(0);
    expect(depoyuOku(JSON.stringify(r.depo), new Date(son)).denemeler).toHaveLength(1);
  });

  it('counts time up to the limit only', () => {
    const r = denemeyiBitir(bosDepo(new Date(T0)), plan, s, T0 + 999 * 60_000);
    expect(r.gecenDakika).toBe(155);
    expect(r.sonuc).toMatchObject({ dogru: 0, bos: 120, baraj: false });
  });
});
