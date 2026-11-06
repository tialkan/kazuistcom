/**
 * Rule based trace checker. Pure functions, no network, no storage, no logging: the pasted text never
 * leaves the function call (docs/tespit/yazim-kurallari.md 9.3 and 9.4: this is a count of traces, not a
 * verdict about who wrote the text).
 */
import {
  BAGLAC_LISTESI,
  BIR_OLARAK_DESEN,
  CUMLE_BASI_BAGLACLARI,
  KALIP_FIILLER,
  KATILIMCI_TERIMLERI,
  izler,
  type Aile,
  type Iz,
  type Siddet,
} from './izler.ts';

export type { Aile, Siddet } from './izler.ts';

/** Longest text the checker accepts; keeps the page responsive on phones. */
export const EN_FAZLA_KARAKTER = 100_000;
/** Below this many words rhythm figures are unreliable (rule 9.3: short texts give false positives). */
export const KISA_METIN_SOZCUK = 150;
/** Fewest sentences for which a standard deviation is reported (otherwise "ölçülmedi", rule 10.6). */
export const EN_AZ_CUMLE = 5;
/** Heuristic threshold, not from the rule text: coefficient of variation of sentence length. */
export const CoV_ESIGI = 0.3;

export interface Bulgu {
  sira: number;
  kural: string;
  aile: Aile;
  siddet: Siddet;
  baslangic: number;
  bitis: number;
  satir: number;
  sutun: number;
  parca: string;
  once: string;
  sonra: string;
  /** Paragraph level measure (6.3, 5.19): listed, but not painted over the whole paragraph. */
  aralik: boolean;
}

export interface Ritim {
  cumleSayisi: number;
  ortalama: number | null;
  enKisa: number | null;
  enUzun: number | null;
  sapma: number | null;
  degiskenlik: number | null;
  /** Share of sentences ending in -mektedir (0..1), null when not measurable. */
  mektedirOrani: number | null;
  /** Share of sentences ending in -dır, -dir, -dur, -dür, -tır ... but not in -mektedir. */
  dirOrani: number | null;
}

export type OlcumAnahtari = 'degiskenlik' | 'mektedirDir' | 'tirnak' | 'kesme' | 'kisaMetin';

export interface Olcum {
  anahtar: OlcumAnahtari;
  kural: string;
  /** True when the figure crosses the heuristic or rule based threshold. */
  uyari: boolean;
  /** Figure shown with the measure, formatted by the caller. */
  deger: number | null;
}

export interface TekrarSatiri {
  ifade: string;
  adet: number;
}

export interface Sonuc {
  sozcuk: number;
  cumle: number;
  karakter: number;
  satir: number;
  bulgular: Bulgu[];
  say: Record<Siddet, number>;
  /** Traces (kesin, olasi, zayif) per 1000 words; null for an empty text. */
  yogunluk: number | null;
  ailelerSay: Partial<Record<Aile, number>>;
  ritim: Ritim;
  olcumler: Olcum[];
  tekrar: TekrarSatiri[];
  /** The text the offsets refer to (NFC normalised). */
  metin: string;
}

/** Turkish lower casing that never changes the string length, so offsets stay valid. */
export function kucukTr(s: string): string {
  const k = s.toLocaleLowerCase('tr-TR');
  if (k.length === s.length) return k;
  let cikti = '';
  for (const ch of s) {
    const l = ch.toLocaleLowerCase('tr-TR');
    cikti += l.length === ch.length ? l : ch;
  }
  return cikti;
}

const SIDDET_SIRA: Record<Siddet, number> = { kesin: 3, olasi: 2, zayif: 1, bilgi: 0 };

const SOZCUK = /[\p{L}\p{N}]+(?:['’.,-][\p{L}\p{N}]+)*/gu;
const KISALTMALAR = new Set([
  'vb',
  'vs',
  'vd',
  'bkz',
  'örn',
  'yy',
  'no',
  's',
  'ss',
  'c',
  'cilt',
  'sy',
  'bs',
  'dr',
  'prof',
  'doç',
  'arş',
  'gör',
  'öğr',
  'çev',
  'ed',
  'haz',
  'krş',
  'yak',
  'ort',
  'tel',
  'sn',
  'dk',
  'mad',
  'md',
  'fıkra',
  'bent',
  'mah',
  'cad',
  'sok',
  'ltd',
  'şti',
  'a.ş',
  'et',
  'al',
  'vol',
  'pp',
  'ibid',
]);

interface Cumle {
  baslangic: number;
  bitis: number;
  metin: string;
  sozcuk: number;
  paragraf: number;
  /** Heading like block: one short line without closing punctuation. Excluded from sentence statistics. */
  baslik: boolean;
}

interface Blok {
  baslangic: number;
  bitis: number;
}

const KAPANIS = /[.!?…:;"”’»)\]]$/;

/** Splits the text into paragraph blocks. A hard wrapped line without closing punctuation joins the next. */
function bloklaraAyir(metin: string): Blok[] {
  const bloklar: Blok[] = [];
  let konum = 0;
  let acik: Blok | undefined;
  let oncekiSatir = '';
  for (const satir of metin.split('\n')) {
    const bas = konum;
    konum += satir.length + 1;
    const kes = satir.trim();
    if (!kes) {
      acik = undefined;
      oncekiSatir = '';
      continue;
    }
    const basIndeks = bas + satir.indexOf(kes);
    const bitis = basIndeks + kes.length;
    const oncekiKapali =
      !oncekiSatir || KAPANIS.test(oncekiSatir) || (oncekiSatir.match(SOZCUK)?.length ?? 0) < 12;
    if (acik && !oncekiKapali) {
      acik.bitis = bitis;
    } else {
      acik = { baslangic: basIndeks, bitis };
      bloklar.push(acik);
    }
    oncekiSatir = kes;
  }
  return bloklar;
}

function cumleleriAyir(metin: string): Cumle[] {
  const cumleler: Cumle[] = [];
  bloklaraAyir(metin).forEach((blok, paragraf) => {
    const govde = metin.slice(blok.baslangic, blok.bitis);
    const parcalar: Array<[number, number]> = [];
    let bas = 0;
    let i = 0;
    while (i < govde.length) {
      const ch = govde[i] ?? '';
      if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
        let j = i;
        while ('.!?…'.includes(govde[j + 1] ?? 'x')) j += 1;
        let k = j + 1;
        while ('"”’»)]'.includes(govde[k] ?? 'x')) k += 1;
        const bosluk = /\s/.test(govde[k] ?? '');
        const son = k >= govde.length;
        let bitir = son || bosluk;
        if (bitir && !son) {
          let n = k;
          while (/\s/.test(govde[n] ?? '')) n += 1;
          const sonraki = govde[n] ?? '';
          if (/\p{Ll}/u.test(sonraki)) bitir = false;
          if (bitir && ch === '.' && j === i) {
            // Walk back over the preceding token (a bounded slice keeps this linear for long paragraphs).
            const once = /([\p{L}\p{N}.]+)$/u.exec(govde.slice(Math.max(0, i - 24), i))?.[1] ?? '';
            const kok = kucukTr(once).replace(/\.$/, '');
            if (KISALTMALAR.has(kok)) bitir = false;
            if (/^\p{Lu}$/u.test(once)) bitir = false;
          }
        }
        if (bitir) {
          parcalar.push([bas, k]);
          bas = k;
        }
        i = k;
        continue;
      }
      i += 1;
    }
    if (bas < govde.length) parcalar.push([bas, govde.length]);

    const tekSatir = !govde.includes('\n');
    for (const [a, b] of parcalar) {
      const ham = govde.slice(a, b);
      const kes = ham.trim();
      if (!kes) continue;
      const baslangic = blok.baslangic + a + ham.indexOf(kes);
      const sozcuk = kes.match(SOZCUK)?.length ?? 0;
      if (sozcuk === 0) continue;
      cumleler.push({
        baslangic,
        bitis: baslangic + kes.length,
        metin: kes,
        sozcuk,
        paragraf,
        baslik: tekSatir && parcalar.length === 1 && sozcuk < 12 && !KAPANIS.test(kes),
      });
    }
  });
  return cumleler;
}

const sondaKelime = (c: string): string => {
  const sozler = c.match(/[\p{L}]+/gu);
  return sozler ? kucukTr(sozler[sozler.length - 1] ?? '') : '';
};
const MEKTEDIR = /(?:mekte|makta)(?:dir|dır|dur|dür)$/u;
const DIR = /[dt][iıuü]r$/u;

function ritimOlc(cumleler: Cumle[]): Ritim {
  const sayilar = cumleler.map((c) => c.sozcuk);
  const n = sayilar.length;
  if (n === 0) {
    return {
      cumleSayisi: 0,
      ortalama: null,
      enKisa: null,
      enUzun: null,
      sapma: null,
      degiskenlik: null,
      mektedirOrani: null,
      dirOrani: null,
    };
  }
  const ort = sayilar.reduce((a, b) => a + b, 0) / n;
  const sapma = Math.sqrt(sayilar.reduce((a, b) => a + (b - ort) ** 2, 0) / n);
  let mektedir = 0;
  let dir = 0;
  for (const c of cumleler) {
    const son = sondaKelime(c.metin);
    if (MEKTEDIR.test(son)) mektedir += 1;
    else if (son.length >= 4 && DIR.test(son)) dir += 1;
  }
  const yeterli = n >= EN_AZ_CUMLE;
  return {
    cumleSayisi: n,
    ortalama: ort,
    enKisa: Math.min(...sayilar),
    enUzun: Math.max(...sayilar),
    sapma: yeterli ? sapma : null,
    degiskenlik: yeterli && ort > 0 ? sapma / ort : null,
    mektedirOrani: mektedir / n,
    dirOrani: dir / n,
  };
}

const derle = (iz: Iz): RegExp => {
  const sinir = iz.sinir ? ['(?<![\\p{L}\\p{N}_])', '(?![\\p{L}\\p{N}_])'] : ['', ''];
  return new RegExp(`${sinir[0]}(?:${iz.desen})${sinir[1]}`, 'gum');
};
const derlenmis = izler.map((iz) => ({ iz, re: derle(iz) }));

interface Aday {
  kural: string;
  aile: Aile;
  siddet: Siddet;
  baslangic: number;
  bitis: number;
  sirasi: number;
}

function satirIndeksi(metin: string): number[] {
  const bas = [0];
  for (let i = 0; i < metin.length; i += 1) if (metin[i] === '\n') bas.push(i + 1);
  return bas;
}

function konumBul(basList: number[], konum: number): { satir: number; sutun: number } {
  let alt = 0;
  let ust = basList.length - 1;
  while (alt < ust) {
    const orta = Math.ceil((alt + ust) / 2);
    if ((basList[orta] ?? 0) <= konum) alt = orta;
    else ust = orta - 1;
  }
  return { satir: alt + 1, sutun: konum - (basList[alt] ?? 0) + 1 };
}

/** Index of the sentence that contains `konum`, or -1. */
function cumleBul(cumleler: Cumle[], konum: number): number {
  let alt = 0;
  let ust = cumleler.length - 1;
  let bulunan = -1;
  while (alt <= ust) {
    const orta = (alt + ust) >> 1;
    const c = cumleler[orta];
    if (!c) break;
    if (c.baslangic <= konum) {
      bulunan = orta;
      alt = orta + 1;
    } else ust = orta - 1;
  }
  const c = cumleler[bulunan];
  return c && konum < c.bitis ? bulunan : -1;
}

const ACILIS_ISARETLERI = /^["“‘'([]*$/;

function adaylariTopla(metin: string, kucuk: string, cumleler: Cumle[]): Aday[] {
  const adaylar: Aday[] = [];
  derlenmis.forEach(({ iz, re }, sirasi) => {
    const kaynak = iz.orijinal ? metin : kucuk;
    re.lastIndex = 0;
    for (const m of kaynak.matchAll(re)) {
      if (m[0].length === 0) continue;
      const baslangic = m.index;
      if (iz.cumleBasi) {
        const c = cumleler[cumleBul(cumleler, baslangic)];
        if (!c || !ACILIS_ISARETLERI.test(metin.slice(c.baslangic, baslangic))) continue;
      }
      adaylar.push({
        kural: iz.kural,
        aile: iz.aile,
        siddet: iz.siddet,
        baslangic,
        bitis: baslangic + m[0].length,
        sirasi,
      });
    }
  });

  // Sentence level rules.
  const birOlarak = new RegExp(BIR_OLARAK_DESEN, 'u');
  for (const c of cumleler) {
    const ks = kucukTr(c.metin);
    const bo = birOlarak.exec(ks);
    if (bo) {
      adaylar.push({
        kural: '6.25',
        aile: 'turkce',
        siddet: 'olasi',
        baslangic: c.baslangic,
        bitis: c.baslangic + bo[0].length,
        sirasi: izler.length,
      });
    }
    for (const b of CUMLE_BASI_BAGLACLARI) {
      if (ks.startsWith(`${b},`)) {
        adaylar.push({
          kural: '6.14',
          aile: 'turkce',
          siddet: 'zayif',
          baslangic: c.baslangic,
          bitis: c.baslangic + b.length + 1,
          sirasi: izler.length + 1,
        });
        break;
      }
    }
  }
  return adaylar;
}

/** Drops duplicates and spans that sit inside a longer span of equal or higher severity. */
function ayikla(adaylar: Aday[]): Aday[] {
  const sirali = [...adaylar].sort(
    (a, b) =>
      a.baslangic - b.baslangic ||
      b.bitis - a.bitis ||
      SIDDET_SIRA[b.siddet] - SIDDET_SIRA[a.siddet] ||
      a.sirasi - b.sirasi,
  );
  const sonuc: Aday[] = [];
  // Only spans that still reach the current start can contain it; sorted input lets the window shrink.
  let acik: Aday[] = [];
  for (const a of sirali) {
    // Paragraph level findings neither hide nor are hidden by word level ones.
    if (a.aile === 'ritim') {
      sonuc.push(a);
      continue;
    }
    acik = acik.filter((x) => x.bitis >= a.baslangic);
    const kapsayan = acik.some(
      (x) =>
        x.bitis >= a.bitis &&
        SIDDET_SIRA[x.siddet] >= SIDDET_SIRA[a.siddet] &&
        (x.bitis - x.baslangic > a.bitis - a.baslangic || x.baslangic === a.baslangic),
    );
    if (!kapsayan) {
      sonuc.push(a);
      acik.push(a);
    }
  }
  return sonuc;
}

function paragrafBulgulari(cumleler: Cumle[], kucuk: string): Aday[] {
  const adaylar: Aday[] = [];
  const govdeCumleler = cumleler.filter((c) => !c.baslik);

  // 6.3: more than half of a paragraph ending in -mektedir or -dır, and three -mektedir in a row.
  const paragraflar = new Map<number, Cumle[]>();
  for (const c of govdeCumleler) {
    const grup = paragraflar.get(c.paragraf);
    if (grup) grup.push(c);
    else paragraflar.set(c.paragraf, [c]);
  }
  for (const grup of paragraflar.values()) {
    if (grup.length < 3) continue;
    const bitenler = grup.filter((c) => {
      const son = sondaKelime(c.metin);
      return MEKTEDIR.test(son) || (son.length >= 4 && DIR.test(son));
    });
    const ilk = grup[0];
    const son = grup[grup.length - 1];
    if (ilk && son && bitenler.length / grup.length > 0.5) {
      adaylar.push({
        kural: '6.3',
        aile: 'ritim',
        siddet: 'zayif',
        baslangic: ilk.baslangic,
        bitis: son.bitis,
        sirasi: izler.length + 2,
      });
    }
  }
  for (let i = 2; i < govdeCumleler.length; i += 1) {
    const uc = govdeCumleler.slice(i - 2, i + 1);
    if (uc.every((c) => MEKTEDIR.test(sondaKelime(c.metin)))) {
      const ilk = uc[0];
      const son = uc[2];
      if (ilk && son) {
        adaylar.push({
          kural: '6.3',
          aile: 'ritim',
          siddet: 'olasi',
          baslangic: ilk.baslangic,
          bitis: son.bitis,
          sirasi: izler.length + 3,
        });
      }
    }
  }

  // 5.19: four or more consecutive sentences of nearly the same length (within four words).
  let i = 0;
  while (i < govdeCumleler.length) {
    let j = i;
    let alt = govdeCumleler[i]?.sozcuk ?? 0;
    let ust = alt;
    while (j + 1 < govdeCumleler.length) {
      const s = govdeCumleler[j + 1]?.sozcuk ?? 0;
      if (Math.max(ust, s) - Math.min(alt, s) > 4) break;
      alt = Math.min(alt, s);
      ust = Math.max(ust, s);
      j += 1;
    }
    const uzunluk = j - i + 1;
    const ilk = govdeCumleler[i];
    const son = govdeCumleler[j];
    if (uzunluk >= 4 && alt >= 12 && ilk && son) {
      adaylar.push({
        kural: '5.19',
        aile: 'ritim',
        siddet: 'zayif',
        baslangic: ilk.baslangic,
        bitis: son.bitis,
        sirasi: izler.length + 4,
      });
      i = j + 1;
    } else i += 1;
  }

  // 4.6: the same connector opening three or more paragraphs.
  const acilislar = new Map<string, Cumle[]>();
  const gorulen = new Set<number>();
  for (const c of govdeCumleler) {
    if (gorulen.has(c.paragraf)) continue;
    gorulen.add(c.paragraf);
    const ks = kucukTr(c.metin);
    const b = BAGLAC_LISTESI.find((x) => new RegExp(`^${x}(?![\\p{L}])`, 'u').test(ks));
    if (b) acilislar.set(b, [...(acilislar.get(b) ?? []), c]);
  }
  for (const [b, grup] of acilislar) {
    if (grup.length < 3) continue;
    for (const c of grup) {
      adaylar.push({
        kural: '4.6',
        aile: 'kalip',
        siddet: 'zayif',
        baslangic: c.baslangic,
        bitis: c.baslangic + b.length,
        sirasi: izler.length + 5,
      });
    }
  }

  // 6.10: headings in English style title case.
  for (const c of cumleler) {
    if (!c.baslik) continue;
    const sozler = c.metin.match(SOZCUK) ?? [];
    const asil = sozler.filter((w) => !['ve', 'ile', 'veya', 'için', 'ya', 'da'].includes(kucukTr(w)));
    const buyuk = asil.filter((w) => /^\p{Lu}/u.test(w)).length;
    if (sozler.length >= 3 && asil.length >= 3 && buyuk === asil.length && sozler.length > asil.length) {
      adaylar.push({
        kural: '6.10',
        aile: 'turkce',
        siddet: 'zayif',
        baslangic: c.baslangic,
        bitis: c.bitis,
        sirasi: izler.length + 6,
      });
    }
  }

  // 4.9: three or more labels for the same person.
  const goruldu: Array<{ terim: string; konum: number }> = [];
  for (const t of KATILIMCI_TERIMLERI) {
    const m = new RegExp(`(?<![\\p{L}\\p{N}])${t}\\p{L}*`, 'u').exec(kucuk);
    if (m) goruldu.push({ terim: t, konum: m.index });
  }
  if (goruldu.length >= 3) {
    for (const g of goruldu) {
      const m = new RegExp(`(?<![\\p{L}\\p{N}])${g.terim}\\p{L}*`, 'u').exec(kucuk);
      adaylar.push({
        kural: '4.9',
        aile: 'sozcuk',
        siddet: 'zayif',
        baslangic: g.konum,
        bitis: g.konum + (m?.[0].length ?? g.terim.length),
        sirasi: izler.length + 7,
      });
    }
  }
  return adaylar;
}

function tekrarSay(kucuk: string): TekrarSatiri[] {
  const satirlar: TekrarSatiri[] = [];
  for (const b of BAGLAC_LISTESI) {
    const adet = [...kucuk.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${b}(?![\\p{L}\\p{N}])`, 'gu'))].length;
    if (adet > 0) satirlar.push({ ifade: b, adet });
  }
  for (const f of KALIP_FIILLER) {
    const adet = [
      ...kucuk.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])(?:${f.desen})(?![\\p{L}\\p{N}_])`, 'gu')),
    ].length;
    if (adet > 0) satirlar.push({ ifade: f.etiket, adet });
  }
  return satirlar.sort((a, b) => b.adet - a.adet || a.ifade.localeCompare(b.ifade, 'tr-TR')).slice(0, 10);
}

export function denetle(girdi: string): Sonuc {
  const metin = girdi.normalize('NFC').replace(/\r\n?/g, '\n');
  const kucuk = kucukTr(metin);
  const cumleler = cumleleriAyir(metin);
  const govde = cumleler.filter((c) => !c.baslik);
  const sozcuk = metin.match(SOZCUK)?.length ?? 0;

  const adaylar = ayikla([...adaylariTopla(metin, kucuk, cumleler), ...paragrafBulgulari(cumleler, kucuk)]);
  const basList = satirIndeksi(metin);
  const bulgular: Bulgu[] = adaylar
    .sort((a, b) => a.baslangic - b.baslangic || b.bitis - a.bitis)
    .map((a, sira) => {
      const { satir, sutun } = konumBul(basList, a.baslangic);
      const once = metin.slice(Math.max(0, a.baslangic - 40), a.baslangic).replace(/\s+/g, ' ');
      const sonra = metin.slice(a.bitis, a.bitis + 40).replace(/\s+/g, ' ');
      const parca = metin.slice(a.baslangic, Math.min(a.bitis, a.baslangic + 160)).replace(/\s+/g, ' ');
      return {
        sira,
        kural: a.kural,
        aile: a.aile,
        siddet: a.siddet,
        baslangic: a.baslangic,
        bitis: a.bitis,
        satir,
        sutun,
        parca,
        once,
        sonra,
        aralik: a.aile === 'ritim',
      };
    });

  const say: Record<Siddet, number> = { kesin: 0, olasi: 0, zayif: 0, bilgi: 0 };
  const ailelerSay: Partial<Record<Aile, number>> = {};
  for (const b of bulgular) {
    say[b.siddet] += 1;
    if (b.siddet !== 'bilgi') ailelerSay[b.aile] = (ailelerSay[b.aile] ?? 0) + 1;
  }
  const iz = say.kesin + say.olasi + say.zayif;
  const ritim = ritimOlc(govde);

  const olcumler: Olcum[] = [];
  if (sozcuk > 0 && sozcuk < KISA_METIN_SOZCUK) {
    olcumler.push({ anahtar: 'kisaMetin', kural: '9.3', uyari: true, deger: sozcuk });
  }
  if (ritim.degiskenlik !== null) {
    olcumler.push({
      anahtar: 'degiskenlik',
      kural: '5.19',
      uyari: ritim.degiskenlik < CoV_ESIGI,
      deger: ritim.degiskenlik,
    });
  }
  if (ritim.mektedirOrani !== null && ritim.dirOrani !== null && ritim.cumleSayisi >= EN_AZ_CUMLE) {
    const toplam = ritim.mektedirOrani + ritim.dirOrani;
    olcumler.push({ anahtar: 'mektedirDir', kural: '6.3', uyari: toplam > 0.5, deger: toplam });
  }
  const dTirnak = (metin.match(/"/g) ?? []).length;
  const eTirnak = (metin.match(/[“”]/g) ?? []).length;
  if (dTirnak > 0 && eTirnak > 0)
    olcumler.push({ anahtar: 'tirnak', kural: '7.7', uyari: true, deger: null });
  const dKesme = (metin.match(/'/g) ?? []).length;
  const eKesme = (metin.match(/’/g) ?? []).length;
  if (dKesme > 0 && eKesme > 0) olcumler.push({ anahtar: 'kesme', kural: '7.7', uyari: true, deger: null });

  return {
    sozcuk,
    cumle: govde.length,
    karakter: metin.length,
    satir: basList.length,
    bulgular,
    say,
    yogunluk: sozcuk > 0 ? (iz / sozcuk) * 1000 : null,
    ailelerSay,
    ritim,
    olcumler,
    tekrar: tekrarSay(kucuk),
    metin,
  };
}

export interface Parca {
  metin: string;
  /** Finding indexes covering this piece; empty for plain text. */
  bulgular: number[];
  siddet?: Siddet;
}

/** Splits the text into plain and marked pieces for the marked view; overlapping findings share a piece. */
export function parcala(metin: string, bulgular: Bulgu[]): Parca[] {
  const noktalar = new Set<number>([0, metin.length]);
  for (const b of bulgular) {
    noktalar.add(b.baslangic);
    noktalar.add(Math.min(b.bitis, metin.length));
  }
  const sirali = [...noktalar].sort((a, b) => a - b);
  const parcalar: Parca[] = [];
  for (let i = 0; i + 1 < sirali.length; i += 1) {
    const a = sirali[i] ?? 0;
    const b = sirali[i + 1] ?? 0;
    if (b <= a) continue;
    const kapsayan = bulgular.filter((x) => x.baslangic <= a && x.bitis >= b);
    const en = kapsayan.reduce<Siddet | undefined>(
      (s, x) => (s === undefined || SIDDET_SIRA[x.siddet] > SIDDET_SIRA[s] ? x.siddet : s),
      undefined,
    );
    const onceki = parcalar[parcalar.length - 1];
    const idler = kapsayan.map((x) => x.sira);
    if (onceki && onceki.bulgular.join() === idler.join()) onceki.metin += metin.slice(a, b);
    else parcalar.push({ metin: metin.slice(a, b), bulgular: idler, ...(en ? { siddet: en } : {}) });
  }
  return parcalar;
}
