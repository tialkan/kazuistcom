import { describe, expect, it } from 'vitest';
import {
  birlesikRapor,
  denemeKur,
  denemePuanla,
  denemeyeUygun,
  kalanDakika,
  kismiKotalar,
  paylastir,
  sureDoldu,
  sureHesapla,
  tamKotalar,
} from './deneme.ts';
import { hmgsAlanlari, hmgsSinavi } from './hmgs-alanlari.ts';
import { kartGorunumu } from './kart.ts';
import { kartYap, sentetikHavuz } from './test-verisi.ts';

describe('HMGS plan Ek G table', () => {
  it('has 20 areas whose shares add up to 100 percent and whose questions add up to 120', () => {
    expect(hmgsAlanlari).toHaveLength(20);
    expect(hmgsAlanlari.reduce((n, a) => n + a.oranBinde, 0)).toBe(1000);
    expect(hmgsAlanlari.reduce((n, a) => n + a.denemeSorusu, 0)).toBe(120);
    expect(hmgsAlanlari.reduce((n, a) => n + a.hedefSoru, 0)).toBe(600);
    expect(new Set(hmgsAlanlari.map((a) => a.slug)).size).toBe(20);
  });

  it('has the exam questions equal to the share times 120 and the target equal to five times the exam questions', () => {
    for (const a of hmgsAlanlari) {
      expect(a.denemeSorusu, a.slug).toBe((a.oranBinde * 120) / 1000);
      expect(a.hedefSoru, a.slug).toBe(a.denemeSorusu * 5);
    }
  });

  it('states the exam format of the OSYM 2026 guide as recorded in the plan', () => {
    expect(hmgsSinavi).toEqual({
      soruSayisi: 120,
      secenekSayisi: 5,
      sureDakika: 155,
      tamPuan: 100,
      baraj: 70,
    });
  });

  it('reproduces the table from the plan for a few named rows', () => {
    const satir = (slug: string) => hmgsAlanlari.find((a) => a.slug === slug);
    expect(satir('medeni-hukuk')).toMatchObject({ oranBinde: 125, denemeSorusu: 15, hedefSoru: 75 });
    expect(satir('anayasa-yargisi')).toMatchObject({ oranBinde: 25, denemeSorusu: 3, hedefSoru: 15 });
    expect(satir('ceza-hukuku')).toMatchObject({ oranBinde: 75, denemeSorusu: 9, hedefSoru: 45 });
    expect(satir('is-ve-sosyal-guvenlik-hukuku')).toMatchObject({
      oranBinde: 50,
      denemeSorusu: 6,
      hedefSoru: 30,
    });
  });
});

describe('full exam distribution', () => {
  const plan = denemeKur(sentetikHavuz(), 42);

  it('builds 120 questions in 155 minutes when every area has enough questions', () => {
    expect(plan.tam).toBe(true);
    expect(plan.soruSayisi).toBe(120);
    expect(plan.sorular).toHaveLength(120);
    expect(plan.sureDakika).toBe(155);
    expect(plan.eksikler).toEqual([]);
  });

  it('draws exactly the Ek G number of questions from every area', () => {
    for (const a of hmgsAlanlari) {
      const n = plan.sorular.filter((s) => s.hmgsAlani === a.slug).length;
      expect(n, a.slug).toBe(a.denemeSorusu);
    }
    expect(plan.kotalar.map((k) => k.secilen)).toEqual(hmgsAlanlari.map((a) => a.denemeSorusu));
  });

  it('never repeats a question and mixes the areas', () => {
    expect(new Set(plan.sorular.map((s) => s.id)).size).toBe(120);
    const ilkOn = plan.sorular.slice(0, 10).map((s) => s.hmgsAlani);
    expect(new Set(ilkOn).size).toBeGreaterThan(3);
  });

  it('is reproducible for a seed and different for another seed', () => {
    const ids = (p: typeof plan) => p.sorular.map((s) => s.id);
    expect(ids(denemeKur(sentetikHavuz(), 42))).toEqual(ids(plan));
    expect(ids(denemeKur(sentetikHavuz(), 43))).not.toEqual(ids(plan));
  });

  it('keeps the distribution for any seed (property check over 25 seeds)', () => {
    for (let tohum = 1; tohum <= 25; tohum++) {
      const p = denemeKur(sentetikHavuz(), tohum);
      expect(p.sorular).toHaveLength(120);
      for (const a of hmgsAlanlari) {
        expect(p.sorular.filter((s) => s.hmgsAlani === a.slug)).toHaveLength(a.denemeSorusu);
      }
    }
  });

  it('apportions 120 by the shares exactly (largest remainder)', () => {
    expect(paylastir(120, Object.fromEntries(hmgsAlanlari.map((a) => [a.slug, a.oranBinde])))).toEqual(
      tamKotalar(),
    );
    expect(Object.values(paylastir(7, { a: 1, b: 1, c: 1 })).reduce((x, y) => x + y, 0)).toBe(7);
    expect(paylastir(5, {})).toEqual({});
  });
});

describe('partial exam while the pool is short', () => {
  it('says the exam is not full, names the missing questions and never pads an area with another', () => {
    const havuz = sentetikHavuz(0, ['medeni-hukuk', 'anayasa-hukuku']);
    const p = denemeKur(havuz, 1);
    expect(p.tam).toBe(false);
    expect(p.eksikler).toHaveLength(18);
    expect(p.soruSayisi).toBeLessThanOrEqual(21);
    expect(p.soruSayisi).toBeGreaterThan(0);
    const alanlar = new Set(p.sorular.map((s) => s.hmgsAlani));
    expect([...alanlar].sort()).toEqual(['anayasa-hukuku', 'medeni-hukuk']);
    for (const k of p.kotalar) expect(k.secilen).toBeLessThanOrEqual(k.mevcut);
  });

  it('keeps the proportions of the areas that are present and scales the time by the question count', () => {
    const p = denemeKur(sentetikHavuz(0, ['medeni-hukuk', 'anayasa-hukuku']), 1);
    const medeni = p.sorular.filter((s) => s.hmgsAlani === 'medeni-hukuk').length;
    const anayasa = p.sorular.filter((s) => s.hmgsAlani === 'anayasa-hukuku').length;
    expect(medeni / anayasa).toBeCloseTo(125 / 50, 0);
    expect(p.sureDakika).toBe(sureHesapla(p.soruSayisi));
    expect(sureHesapla(120)).toBe(155);
    expect(sureHesapla(60)).toBe(78);
  });

  it('gives an empty plan for an empty pool and never fails', () => {
    const p = denemeKur([], 1);
    expect(p.soruSayisi).toBe(0);
    expect(p.tam).toBe(false);
    expect(kismiKotalar({}, 120)).toEqual({});
  });

  it('keeps cards with fewer than four choices out of the exam, as the real exam has five', () => {
    const ikili = kartGorunumu(
      kartYap({
        id: 'medeni-hukuk.001',
        hmgsAlani: 'medeni-hukuk',
        oyun: 'dogru_yanlis',
        secenekler: ['Doğru', 'Yanlış'],
        dogruIndex: 0,
      }),
      'medeni-hukuk',
    );
    expect(denemeyeUygun(ikili)).toBe(false);
    expect(denemeKur([ikili], 1).soruSayisi).toBe(0);
  });
});

describe('scoring, pass mark and subject report', () => {
  const plan = denemeKur(sentetikHavuz(), 42);
  const hepsiDogru = plan.sorular.map((s) => s.dogruIndex);

  it('gives 100 points for 120 correct answers and passes', () => {
    const s = denemePuanla(plan.sorular, hepsiDogru);
    expect(s).toMatchObject({ dogru: 120, yanlis: 0, bos: 0, puan: 100, baraj: true, tekrarKartlari: [] });
  });

  it('puts the pass mark at 84 correct answers of 120 (70 points) and counts correct answers only', () => {
    const cevap = (dogru: number) =>
      plan.sorular.map((s, i) => (i < dogru ? s.dogruIndex : (s.dogruIndex + 1) % 5));
    expect(denemePuanla(plan.sorular, cevap(84))).toMatchObject({ dogru: 84, puan: 70, baraj: true });
    expect(denemePuanla(plan.sorular, cevap(83))).toMatchObject({ dogru: 83, baraj: false });
    expect(denemePuanla(plan.sorular, cevap(83)).puan).toBeCloseTo((83 * 100) / 120, 10);
  });

  it('counts blanks as not correct, without a penalty, and sends wrong and blank cards to the repeat deck', () => {
    const cevaplar = plan.sorular.map((s, i) =>
      i === 0 ? null : i === 1 ? (s.dogruIndex + 1) % 5 : s.dogruIndex,
    );
    const s = denemePuanla(plan.sorular, cevaplar);
    expect(s).toMatchObject({ dogru: 118, yanlis: 1, bos: 1 });
    expect(s.puan).toBeCloseTo((118 * 100) / 120, 10);
    expect(s.tekrarKartlari).toEqual([plan.sorular[0]?.id, plan.sorular[1]?.id]);
  });

  it('reports every area with its correct count, weakest first', () => {
    const cevaplar = plan.sorular.map((s) =>
      s.hmgsAlani === 'medeni-hukuk' ? (s.dogruIndex + 1) % 5 : s.dogruIndex,
    );
    const s = denemePuanla(plan.sorular, cevaplar);
    expect(s.alanlar).toHaveLength(20);
    expect(s.alanlar[0]).toMatchObject({ slug: 'medeni-hukuk', dogru: 0, toplam: 15, oran: 0 });
    expect(s.alanlar.reduce((n, a) => n + a.toplam, 0)).toBe(120);
  });

  it('scales a partial exam by its own question count', () => {
    const p = denemeKur(sentetikHavuz(0, ['medeni-hukuk']), 3);
    const dogru = p.sorular.map((s) => s.dogruIndex);
    const besi = p.sorular.map((s, i) => (i < 5 ? s.dogruIndex : (s.dogruIndex + 1) % 5));
    expect(p.soruSayisi).toBe(15);
    expect(denemePuanla(p.sorular, dogru).puan).toBe(100);
    expect(denemePuanla(p.sorular, besi).puan).toBeCloseTo(100 / 3, 10);
    expect(denemePuanla(p.sorular, besi).baraj).toBe(false);
    expect(
      denemePuanla(
        p.sorular,
        p.sorular.map((s, i) => (i < 11 ? s.dogruIndex : null)),
      ).baraj,
    ).toBe(true);
    expect(denemePuanla([], []).puan).toBe(0);
    expect(denemePuanla([], []).baraj).toBe(false);
  });

  it('combines several attempts into one subject report', () => {
    const r = birlesikRapor([
      { alanlar: { 'medeni-hukuk': { dogru: 3, toplam: 6 }, 'ceza-hukuku': { dogru: 4, toplam: 4 } } },
      { alanlar: { 'medeni-hukuk': { dogru: 1, toplam: 6 } } },
    ]);
    expect(r.map((x) => [x.slug, x.dogru, x.toplam])).toEqual([
      ['medeni-hukuk', 4, 12],
      ['ceza-hukuku', 4, 4],
    ]);
    expect(r[0]?.oran).toBeCloseTo(1 / 3, 10);
  });
});

describe('155 minute clock', () => {
  it('counts down from the start and stops at zero', () => {
    const t0 = Date.UTC(2026, 10, 7, 9, 0, 0);
    expect(kalanDakika(t0, 155, t0)).toBe(155);
    expect(kalanDakika(t0, 155, t0 + 60 * 60_000)).toBe(95);
    expect(sureDoldu(t0, 155, t0 + 154 * 60_000)).toBe(false);
    expect(sureDoldu(t0, 155, t0 + 155 * 60_000)).toBe(true);
    expect(kalanDakika(t0, 155, t0 + 999 * 60_000)).toBe(0);
  });
});
