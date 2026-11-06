import { describe, expect, it } from 'vitest';
import {
  PUAN_DOGRU,
  calismaDerecesi,
  cevapla,
  gecerliKart,
  ilerle,
  ilerlemeYuzdesi,
  karistir,
  oyunKartlari,
  sonCevap,
  turOzeti,
  turuBaslat,
  yanlislariTekrarEt,
} from './oyun.ts';
import { kartGorunumu } from './kart.ts';
import { kartYap } from './test-verisi.ts';

const kartlar = [1, 2, 3, 4].map((n) =>
  kartGorunumu(kartYap({ id: `deneme-deste.00${n}`, dogruIndex: n % 3 }), 'deneme-deste'),
);

describe('a round of cards', () => {
  it('shows one card at a time with a score, a card number and a progress bar', () => {
    let t = turuBaslat(kartlar);
    expect(gecerliKart(t).id).toBe('deneme-deste.001');
    expect(ilerlemeYuzdesi(t)).toBe(0);
    t = cevapla(t, 1); // card 1 correct: 1 % 3 = 1
    expect(t.asama).toBe('cevap');
    expect(t.puan).toBe(PUAN_DOGRU);
    expect(ilerlemeYuzdesi(t)).toBe(25);
    t = ilerle(t);
    expect(gecerliKart(t).id).toBe('deneme-deste.002');
    expect(t.asama).toBe('soru');
  });

  it('accepts only the first answer to a card and ignores out of range choices', () => {
    let t = turuBaslat(kartlar);
    expect(cevapla(t, 9)).toBe(t);
    expect(cevapla(t, -1)).toBe(t);
    t = cevapla(t, 0);
    const ikinci = cevapla(t, 1);
    expect(ikinci).toBe(t);
    expect(t.cevaplar).toHaveLength(1);
    expect(sonCevap(t)?.dogru).toBe(false);
    expect(ilerle(turuBaslat(kartlar))).toEqual(turuBaslat(kartlar));
  });

  it('ends after the last card with the score, the wrong list and a retry round of only the wrong cards', () => {
    let t = turuBaslat(kartlar);
    const secimler = [1, 0, 2, 0]; // correct, wrong, correct (3 % 3 = 0 so 2 is wrong), correct? computed below
    for (const s of secimler) t = ilerle(cevapla(t, s));
    expect(t.asama).toBe('bitti');
    expect(ilerlemeYuzdesi(t)).toBe(100);
    const o = turOzeti(t);
    const beklenenDogru = kartlar.filter((k, i) => k.dogruIndex === secimler[i]).length;
    expect(o).toMatchObject({
      toplam: 4,
      dogru: beklenenDogru,
      yanlis: 4 - beklenenDogru,
      puan: beklenenDogru * PUAN_DOGRU,
      enYuksekPuan: 40,
    });
    expect(o.yanlislar.map((k) => k.id)).toEqual(
      kartlar.filter((k, i) => k.dogruIndex !== secimler[i]).map((k) => k.id),
    );
    const tekrar = yanlislariTekrarEt(t);
    expect(tekrar?.kartlar).toHaveLength(4 - beklenenDogru);
    expect(tekrar?.turNo).toBe(2);
    expect(tekrar?.puan).toBe(0);
  });

  it('offers no retry round when every answer was right', () => {
    let t = turuBaslat(kartlar);
    for (const k of kartlar) t = ilerle(cevapla(t, k.dogruIndex));
    expect(yanlislariTekrarEt(t)).toBeNull();
    expect(turOzeti(t).puan).toBe(40);
  });

  it('refuses an empty round', () => {
    expect(() => turuBaslat([])).toThrow(RangeError);
  });
});

describe('helpers', () => {
  it('filters the cards of one game', () => {
    const karisik = [
      ...kartlar,
      kartGorunumu(
        kartYap({
          id: 'deneme-deste.009',
          oyun: 'dogru_yanlis',
          secenekler: ['Doğru', 'Yanlış'],
          dogruIndex: 0,
        }),
        'deneme-deste',
      ),
    ];
    expect(oyunKartlari(karisik, 'dogru_yanlis').map((k) => k.id)).toEqual(['deneme-deste.009']);
    expect(oyunKartlari(karisik, 'olay_karti')).toHaveLength(4);
  });

  it('shuffles reproducibly without losing or duplicating items', () => {
    const l = Array.from({ length: 20 }, (_, i) => i);
    expect(karistir(l, 7)).toEqual(karistir(l, 7));
    expect(karistir(l, 7)).not.toEqual(karistir(l, 8));
    expect([...karistir(l, 7)].sort((a, b) => a - b)).toEqual(l);
    expect(l[0]).toBe(0);
  });

  it('maps a study answer to a rating: wrong is Again, right keeps the learner choice', () => {
    expect(calismaDerecesi(false, 4)).toBe(1);
    expect(calismaDerecesi(true, 2)).toBe(2);
    expect(calismaDerecesi(true, 3)).toBe(3);
    expect(calismaDerecesi(true, 4)).toBe(4);
  });
});
