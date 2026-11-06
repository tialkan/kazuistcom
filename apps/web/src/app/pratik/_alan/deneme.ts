/**
 * HMGS practice exam (plan 10.6/3, Ek G, FR-93): 120 questions in the area proportions of the OSYM 2026 guide,
 * 155 minutes, 100 points on correct answers only, pass mark 70, report by subject.
 *
 * A full exam needs enough approved questions in every area. While the pool is short the builder makes a partial
 * exam (same proportions among the areas that have questions, time scaled by question count) and says so; it
 * never invents questions and never pads an area with another one. Only questions with four or five choices
 * enter the exam, because the real exam has five choices and a two choice card would make the pass mark meaningless.
 */
import type { KartGorunumu } from './kart.ts';
import { hmgsAlanlari, hmgsAlaniBul, hmgsSinavi } from './hmgs-alanlari.ts';
import { karistir } from './oyun.ts';

export const denemeyeUygun = (k: KartGorunumu) => k.hmgsAlani !== null && k.secenekler.length >= 4;

/** Largest remainder apportionment of `toplam` over integer weights. */
export function paylastir(toplam: number, agirliklar: Record<string, number>): Record<string, number> {
  const anahtarlar = Object.keys(agirliklar).sort();
  const w = anahtarlar.reduce((n, a) => n + (agirliklar[a] as number), 0);
  const sonuc: Record<string, number> = {};
  if (w === 0) return sonuc;
  const kalanlar: { a: string; kalan: number }[] = [];
  let dagitilan = 0;
  for (const a of anahtarlar) {
    const tam = ((agirliklar[a] as number) * toplam) / w;
    sonuc[a] = Math.floor(tam);
    dagitilan += sonuc[a] as number;
    kalanlar.push({ a, kalan: tam - Math.floor(tam) });
  }
  kalanlar.sort(
    (x, y) =>
      y.kalan - x.kalan ||
      (agirliklar[y.a] as number) - (agirliklar[x.a] as number) ||
      x.a.localeCompare(y.a),
  );
  for (let i = 0; i < toplam - dagitilan; i++) {
    const hedef = (kalanlar[i] as { a: string }).a;
    sonuc[hedef] = (sonuc[hedef] as number) + 1;
  }
  return sonuc;
}

export const tamKotalar = (): Record<string, number> =>
  Object.fromEntries(hmgsAlanlari.map((a) => [a.slug, a.denemeSorusu]));

export interface AlanKotasi {
  slug: string;
  ad: string;
  /** Questions this area has in the full exam. */
  tamdaki: number;
  /** Questions available in the pool for exams. */
  mevcut: number;
  /** Questions in this exam. */
  secilen: number;
}

export interface DenemePlani {
  tam: boolean;
  soruSayisi: number;
  sureDakika: number;
  kotalar: AlanKotasi[];
  sorular: KartGorunumu[];
  /** Areas that block a full exam, with the number of questions missing. */
  eksikler: { slug: string; ad: string; eksik: number }[];
}

export const sureHesapla = (soruSayisi: number) =>
  Math.ceil((hmgsSinavi.sureDakika * soruSayisi) / hmgsSinavi.soruSayisi);

/** Largest question count (up to `hedef`) whose proportional quotas fit the pool; 0 when the pool is empty. */
export function kismiKotalar(mevcut: Record<string, number>, hedef: number): Record<string, number> {
  const etkin: Record<string, number> = {};
  for (const a of hmgsAlanlari) if ((mevcut[a.slug] ?? 0) > 0) etkin[a.slug] = a.oranBinde;
  const toplamMevcut = Object.keys(etkin).reduce((n, s) => n + (mevcut[s] as number), 0);
  for (let n = Math.min(hedef, toplamMevcut); n >= 1; n--) {
    const q = paylastir(n, etkin);
    if (Object.keys(q).every((s) => (q[s] as number) <= (mevcut[s] as number))) return q;
  }
  return {};
}

/** Builds an exam from the pool, reproducibly for a seed. */
export function denemeKur(
  havuz: readonly KartGorunumu[],
  tohum: number,
  hedef: number = hmgsSinavi.soruSayisi,
): DenemePlani {
  const uygun = havuz.filter(denemeyeUygun);
  const alanlaGore = new Map<string, KartGorunumu[]>();
  for (const k of uygun)
    alanlaGore.set(k.hmgsAlani as string, [...(alanlaGore.get(k.hmgsAlani as string) ?? []), k]);
  const mevcut = Object.fromEntries(hmgsAlanlari.map((a) => [a.slug, alanlaGore.get(a.slug)?.length ?? 0]));
  const eksikler = hmgsAlanlari
    .filter((a) => (mevcut[a.slug] as number) < a.denemeSorusu)
    .map((a) => ({ slug: a.slug, ad: a.ad, eksik: a.denemeSorusu - (mevcut[a.slug] as number) }));
  const tam = eksikler.length === 0 && hedef === hmgsSinavi.soruSayisi;
  const kota = tam ? tamKotalar() : kismiKotalar(mevcut, hedef);
  const secilenler: KartGorunumu[] = [];
  for (const a of hmgsAlanlari) {
    const q = kota[a.slug] ?? 0;
    if (q > 0) {
      const sirali = [...(alanlaGore.get(a.slug) ?? [])].sort((x, y) => x.id.localeCompare(y.id));
      secilenler.push(...karistir(sirali, tohum + hash(a.slug)).slice(0, q));
    }
  }
  const sorular = karistir(secilenler, tohum);
  return {
    tam,
    soruSayisi: sorular.length,
    sureDakika: sureHesapla(sorular.length),
    kotalar: hmgsAlanlari.map((a) => ({
      slug: a.slug,
      ad: a.ad,
      tamdaki: a.denemeSorusu,
      mevcut: mevcut[a.slug] as number,
      secilen: kota[a.slug] ?? 0,
    })),
    sorular,
    eksikler,
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface AlanSonucu {
  slug: string;
  ad: string;
  dogru: number;
  toplam: number;
  /** Share of correct answers, 0 to 1. */
  oran: number;
}

export interface DenemeSonucu {
  soruSayisi: number;
  dogru: number;
  yanlis: number;
  bos: number;
  /** Points out of 100: correct answers only, scaled by the number of questions asked. */
  puan: number;
  /** 70 points or more (84 correct of 120). */
  baraj: boolean;
  alanlar: AlanSonucu[];
  /** Ids of cards answered wrongly or left blank: they fall into the repeat deck. */
  tekrarKartlari: string[];
}

/** Scores an attempt. `cevaplar[i]` is the chosen index for `sorular[i]`, or null when left blank. */
export function denemePuanla(
  sorular: readonly KartGorunumu[],
  cevaplar: readonly (number | null)[],
): DenemeSonucu {
  const alan = new Map<string, { dogru: number; toplam: number }>();
  let dogru = 0;
  let bos = 0;
  const tekrar: string[] = [];
  sorular.forEach((s, i) => {
    const c = cevaplar[i] ?? null;
    const a = alan.get(s.hmgsAlani as string) ?? { dogru: 0, toplam: 0 };
    a.toplam++;
    if (c === null) bos++;
    if (c !== null && c === s.dogruIndex) {
      dogru++;
      a.dogru++;
    } else {
      tekrar.push(s.id);
    }
    alan.set(s.hmgsAlani as string, a);
  });
  const n = sorular.length;
  return {
    soruSayisi: n,
    dogru,
    yanlis: n - dogru - bos,
    bos,
    puan: n ? (dogru * hmgsSinavi.tamPuan) / n : 0,
    baraj: n > 0 && dogru * hmgsSinavi.tamPuan >= hmgsSinavi.baraj * n,
    alanlar: [...alan.entries()]
      .map(([slug, a]) => ({
        slug,
        ad: hmgsAlaniBul(slug)?.ad ?? slug,
        dogru: a.dogru,
        toplam: a.toplam,
        oran: a.dogru / a.toplam,
      }))
      .sort((x, y) => x.oran - y.oran || x.ad.localeCompare(y.ad, 'tr-TR')),
    tekrarKartlari: tekrar,
  };
}

/** Subject report over several attempts (weakest first). */
export function birlesikRapor(
  denemeler: readonly { alanlar: Record<string, { dogru: number; toplam: number }> }[],
): AlanSonucu[] {
  const toplam = new Map<string, { dogru: number; toplam: number }>();
  for (const d of denemeler) {
    for (const [slug, a] of Object.entries(d.alanlar)) {
      const t = toplam.get(slug) ?? { dogru: 0, toplam: 0 };
      t.dogru += a.dogru;
      t.toplam += a.toplam;
      toplam.set(slug, t);
    }
  }
  return [...toplam.entries()]
    .map(([slug, a]) => ({
      slug,
      ad: hmgsAlaniBul(slug)?.ad ?? slug,
      dogru: a.dogru,
      toplam: a.toplam,
      oran: a.dogru / a.toplam,
    }))
    .sort((x, y) => x.oran - y.oran || x.ad.localeCompare(y.ad, 'tr-TR'));
}

/** Minutes left in a timed attempt; 0 once the time is up. */
export function kalanDakika(baslangic: number, sureDakika: number, simdi: number): number {
  return Math.max(0, sureDakika - (simdi - baslangic) / 60_000);
}

export const sureDoldu = (baslangic: number, sureDakika: number, simdi: number) =>
  kalanDakika(baslangic, sureDakika, simdi) <= 0;
