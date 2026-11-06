/**
 * Round logic shared by the four games (SRS section 7): a round is a list of cards, one answer per card, a score,
 * a progress count and, at the end, the list of wrong answers and a "retry the wrong ones" round (FR-59). The
 * functions are pure so the keyboard and screen reader behaviour of the components rests on tested state.
 */
import type { KartGorunumu, Oyun } from './kart.ts';

export const PUAN_DOGRU = 10;

export type Asama = 'soru' | 'cevap' | 'bitti';

export interface Cevap {
  kartId: string;
  secim: number;
  dogru: boolean;
}

export interface Tur {
  kartlar: readonly KartGorunumu[];
  /** Zero based index of the card on screen. */
  sira: number;
  asama: Asama;
  cevaplar: readonly Cevap[];
  puan: number;
  /** Number of the round: 1 for the first pass, 2 and up for "retry the wrong ones". */
  turNo: number;
}

export function turuBaslat(kartlar: readonly KartGorunumu[], turNo = 1): Tur {
  if (kartlar.length === 0) throw new RangeError('a round needs at least one card');
  return { kartlar, sira: 0, asama: 'soru', cevaplar: [], puan: 0, turNo };
}

export const gecerliKart = (t: Tur): KartGorunumu => t.kartlar[t.sira] as KartGorunumu;

/** Answer the card on screen. Ignored after the first answer and outside the question phase. */
export function cevapla(t: Tur, secim: number): Tur {
  if (t.asama !== 'soru') return t;
  const kart = gecerliKart(t);
  if (!Number.isInteger(secim) || secim < 0 || secim >= kart.secenekler.length) return t;
  const dogru = secim === kart.dogruIndex;
  return {
    ...t,
    asama: 'cevap',
    cevaplar: [...t.cevaplar, { kartId: kart.id, secim, dogru }],
    puan: t.puan + (dogru ? PUAN_DOGRU : 0),
  };
}

/** Move on after the explanation; after the last card the round is over. */
export function ilerle(t: Tur): Tur {
  if (t.asama !== 'cevap') return t;
  return t.sira + 1 >= t.kartlar.length
    ? { ...t, asama: 'bitti' }
    : { ...t, sira: t.sira + 1, asama: 'soru' };
}

export const sonCevap = (t: Tur): Cevap | undefined => t.cevaplar[t.cevaplar.length - 1];

export interface TurOzeti {
  toplam: number;
  dogru: number;
  yanlis: number;
  puan: number;
  enYuksekPuan: number;
  yanlislar: KartGorunumu[];
}

export function turOzeti(t: Tur): TurOzeti {
  const yanlisIdleri = new Set(t.cevaplar.filter((c) => !c.dogru).map((c) => c.kartId));
  const dogru = t.cevaplar.filter((c) => c.dogru).length;
  return {
    toplam: t.kartlar.length,
    dogru,
    yanlis: t.cevaplar.length - dogru,
    puan: t.puan,
    enYuksekPuan: t.kartlar.length * PUAN_DOGRU,
    yanlislar: t.kartlar.filter((k) => yanlisIdleri.has(k.id)),
  };
}

/** "Retry the wrong ones": a new round with only the cards answered wrongly; null when nothing was wrong. */
export function yanlislariTekrarEt(t: Tur): Tur | null {
  const { yanlislar } = turOzeti(t);
  return yanlislar.length ? turuBaslat(yanlislar, t.turNo + 1) : null;
}

/** Progress in whole percent, counting the card on screen as done once it is answered. */
export function ilerlemeYuzdesi(t: Tur): number {
  const biten = t.asama === 'bitti' ? t.kartlar.length : t.sira + (t.asama === 'cevap' ? 1 : 0);
  return Math.round((biten / t.kartlar.length) * 100);
}

/** The card view for one game: `tur` filters a deck to the cards of one of the four games. */
export const oyunKartlari = (kartlar: readonly KartGorunumu[], oyun: Oyun) =>
  kartlar.filter((k) => k.oyun === oyun);

/** Deterministic shuffle (Fisher-Yates with a seeded generator) so a round can be reproduced in tests. */
export function karistir<T>(liste: readonly T[], tohum: number): T[] {
  const a = [...liste];
  const rastgele = mulberry32(tohum);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export function mulberry32(tohum: number) {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rating after a study answer: a wrong answer is Again; a right one is Hard, Good or Easy by the learner's choice. */
export const calismaDerecesi = (dogru: boolean, secilen: 2 | 3 | 4): 1 | 2 | 3 | 4 => (dogru ? secilen : 1);

export const OYUN_ADLARI: Record<Oyun, string> = {
  olay_karti: 'olayKarti',
  hala_gecerli_mi: 'halaGecerliMi',
  dogru_yanlis: 'dogruYanlis',
  hangisi_once: 'hangisiOnce',
};
