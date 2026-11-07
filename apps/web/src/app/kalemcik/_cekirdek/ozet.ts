import icerikVerisi from '../_veri/kalemcik.json' with { type: 'json' };

/**
 * Progress arithmetic and tone of the Kalemcik screen (SRS FR-46..50, FR-54). Pure functions: the screen gets
 * its numbers from the writing project and the last days' logs, nothing is stored here.
 */

export type Ton = 'iyi' | 'son7' | 'yazilmadi' | 'hedef';
export type Hitap = 'sen' | 'siz';

export const VARSAYILAN_SAYFA_KELIME = 300; // TNR 12, 1.5 line spacing (FR-46)
const GUNLUK = 86_400_000;

export interface SayfaDuzeni {
  size: number;
  line: number;
  mTop: number;
  mBottom: number;
  mLeft: number;
  mRight: number;
}

const VARSAYILAN_DUZEN: SayfaDuzeni = { size: 12, line: 1.5, mTop: 3, mBottom: 2.5, mLeft: 3.5, mRight: 2.5 };
const alan = (d: SayfaDuzeni) => (21 - d.mLeft - d.mRight) * (29.7 - d.mTop - d.mBottom);

/**
 * Words per page for a template: 300 for Times New Roman 12 pt with 1.5 spacing and the example margins; it
 * scales with the line height, the character width and the text area (FR-46). An estimate, shown as such.
 */
export function sayfaKatsayisi(d: SayfaDuzeni = VARSAYILAN_DUZEN): number {
  const satirYuksekligi = (VARSAYILAN_DUZEN.size * VARSAYILAN_DUZEN.line) / (d.size * d.line);
  const karakterGenisligi = VARSAYILAN_DUZEN.size / d.size;
  const oran = alan(d) / alan(VARSAYILAN_DUZEN);
  const k = VARSAYILAN_SAYFA_KELIME * satirYuksekligi * karakterGenisligi * oran;
  return Math.min(900, Math.max(100, Math.round(k / 10) * 10));
}

export const kelimedenSayfa = (kelime: number, katsayi = VARSAYILAN_SAYFA_KELIME) =>
  Math.round((kelime / katsayi) * 10) / 10;
export const sayfadanKelime = (sayfa: number, katsayi = VARSAYILAN_SAYFA_KELIME) =>
  Math.round(sayfa * katsayi);

export interface GunKaydi {
  loggedOn: string;
  words: number;
}

export interface OzetGirdisi {
  targetWords: number;
  currentWords: number;
  deadline: string | null;
  createdOn: string;
  recentLogs: GunKaydi[];
}

export interface TakvimGunu {
  gun: string;
  yazildi: boolean;
  kelime: number;
}

export interface Ozet {
  yuzde: number;
  yazilan: number;
  kalan: number;
  /** Days to the deadline, 0 on the day itself, negative after; null without a deadline. */
  kalanGun: number | null;
  gunluk: number;
  takvim: TakvimGunu[];
  /** Days since the last record (or since the project began when there is none). */
  sessizGun: number;
  ton: Ton;
}

const gun = (s: string) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
export const gunFarki = (a: string, b: string) => Math.round((gun(b) - gun(a)) / GUNLUK);
const gunEkle = (s: string, n: number) => new Date(gun(s) + n * GUNLUK).toISOString().slice(0, 10);

/** The last seven days ending today (FR-50), oldest first. */
export function sonYediGun(bugun: string, kayitlar: readonly GunKaydi[]): TakvimGunu[] {
  const toplam = new Map<string, number>();
  for (const k of kayitlar) toplam.set(k.loggedOn, (toplam.get(k.loggedOn) ?? 0) + k.words);
  return Array.from({ length: 7 }, (_, i) => {
    const g = gunEkle(bugun, i - 6);
    const kelime = toplam.get(g) ?? 0;
    return { gun: g, yazildi: kelime > 0, kelime };
  });
}

export function ozetle(p: OzetGirdisi, bugun: string): Ozet {
  const kalan = Math.max(0, p.targetWords - p.currentWords);
  const yuzde = p.targetWords > 0 ? Math.min(100, Math.round((p.currentWords / p.targetWords) * 100)) : 0;
  const kalanGun = p.deadline ? gunFarki(bugun, p.deadline) : null;
  const gunluk = kalanGun === null ? 0 : kalan === 0 ? 0 : Math.ceil(kalan / Math.max(1, kalanGun));
  const yazilanGunler = p.recentLogs
    .filter((k) => k.words > 0)
    .map((k) => k.loggedOn)
    .sort();
  const son = yazilanGunler.at(-1) ?? p.createdOn;
  const sessizGun = Math.max(0, gunFarki(son, bugun));
  const tamam = p.targetWords > 0 && p.currentWords >= p.targetWords;
  let ton: Ton = 'iyi';
  if (tamam) ton = 'hedef';
  else if (sessizGun >= 3) ton = 'yazilmadi';
  else if (kalanGun !== null && kalanGun >= 0 && kalanGun <= 7) ton = 'son7';
  return {
    yuzde,
    yazilan: p.currentWords,
    kalan,
    kalanGun,
    gunluk,
    takvim: sonYediGun(bugun, p.recentLogs),
    sessizGun,
    ton,
  };
}

export interface TonBilgisi {
  renk: string;
  yuz: string;
  mesajlar: { sen: string; siz: string }[];
}
export const tonlar = icerikVerisi.tonlar as Record<Ton, TonBilgisi>;

const sayi = (n: number) => new Intl.NumberFormat('tr-TR').format(n);

/** One message of the tone in the chosen voice, placeholders filled; `tohum` keeps the choice stable per day. */
export function mesajSec(ton: Ton, hitap: Hitap, o: Ozet, calisma: string, tohum: number): string {
  const liste = tonlar[ton].mesajlar;
  const m = liste[Math.abs(tohum) % liste.length];
  const metin = (m ?? { sen: '', siz: '' })[hitap];
  return metin
    .replace(/\{calisma\}/g, calisma)
    .replace(/\{kalan\}/g, sayi(o.kalan))
    .replace(/\{gunluk\}/g, sayi(o.gunluk))
    .replace(/\{gun\}/g, sayi(Math.max(0, o.kalanGun ?? 0)))
    .replace(/\{sessiz\}/g, sayi(o.sessizGun));
}

/** Short weekday label for the calendar in Turkish ("Pzt", "Sal", ...). */
export const gunAdi = (g: string) =>
  new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(gun(g)));

/** YYYY-MM-DD of `d` in Istanbul. */
export const bugunIstanbul = (d: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
