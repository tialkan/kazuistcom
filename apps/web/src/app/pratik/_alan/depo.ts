/**
 * Study progress of one learner: FSRS state per card, daily counters, streak, settings and HMGS attempts.
 * Pure data and pure functions; the browser keeps the serialized value in localStorage (`depoAnahtari`) and the
 * server never sees it (plan 10.6/2, FR-94). Every function returns a new value.
 */
import { z } from 'zod';
import {
  Derece,
  Durum,
  incele,
  vadesiGeldiMi,
  varsayilanAyarlar,
  yeniKart,
  type Ayarlar,
  type KartDurumu,
} from './fsrs.ts';

export const depoAnahtari = 'kazuist.pratik.v1';

/** Daily new card limit; reviews are never limited (plan 10.6/2). */
export const varsayilanYeniKartSiniri = 10;

const tarihSaat = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'ISO date time');
const gun = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const depoKartiSchema = z.object({
  due: tarihSaat,
  stability: z.number().positive(),
  difficulty: z.number().min(1).max(10),
  elapsedDays: z.number().int().min(0),
  scheduledDays: z.number().int().min(0),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  state: z.number().int().min(0).max(3),
  lastReview: tarihSaat.nullable(),
  sonDerece: z.number().int().min(1).max(4).nullable(),
});

const denemeKaydiSchema = z.object({
  tarih: tarihSaat,
  soruSayisi: z.number().int().positive(),
  dogru: z.number().int().min(0),
  puan: z.number().min(0).max(100),
  tam: z.boolean(),
  gecenDakika: z.number().min(0),
  baraj: z.boolean(),
  alanlar: z.record(
    z.string(),
    z.object({ dogru: z.number().int().min(0), toplam: z.number().int().positive() }),
  ),
});

export const depoSchema = z.object({
  surum: z.literal(1),
  ayar: z.object({
    yeniKartSiniri: z.number().int().min(0).max(100),
    hedefHatirlama: z.number().min(0.7).max(0.97),
  }),
  kartlar: z.record(z.string(), depoKartiSchema),
  gunluk: z.object({
    gun,
    yeni: z.number().int().min(0),
    tekrar: z.number().int().min(0),
    dogru: z.number().int().min(0),
  }),
  seri: z.object({ son: gun.nullable(), gun: z.number().int().min(0), enUzun: z.number().int().min(0) }),
  denemeler: z.array(denemeKaydiSchema).max(50),
});
export type Depo = z.infer<typeof depoSchema>;
export type DepoKarti = z.infer<typeof depoKartiSchema>;
export type DenemeKaydi = z.infer<typeof denemeKaydiSchema>;

export function bosDepo(simdi: Date): Depo {
  return {
    surum: 1,
    ayar: { yeniKartSiniri: varsayilanYeniKartSiniri, hedefHatirlama: varsayilanAyarlar.hedefHatirlama },
    kartlar: {},
    gunluk: { gun: gunAnahtari(simdi), yeni: 0, tekrar: 0, dogru: 0 },
    seri: { son: null, gun: 0, enUzun: 0 },
    denemeler: [],
  };
}

/** Calendar day key (YYYY-MM-DD) on the Turkish calendar. */
export function gunAnahtari(t: Date, kaydirmaDk: number = varsayilanAyarlar.gunKaydirmaDk): string {
  return new Date(t.getTime() + kaydirmaDk * 60_000).toISOString().slice(0, 10);
}

/** Reads the serialized value; anything damaged or from another version becomes an empty store. */
export function depoyuOku(ham: string | null, simdi: Date): Depo {
  if (!ham) return bosDepo(simdi);
  try {
    const sonuc = depoSchema.safeParse(JSON.parse(ham));
    return sonuc.success ? gunuYenile(sonuc.data, simdi) : bosDepo(simdi);
  } catch {
    return bosDepo(simdi);
  }
}

/** Resets the daily counters when the calendar day changed and breaks the streak after a missed day. */
export function gunuYenile(d: Depo, simdi: Date): Depo {
  const bugun = gunAnahtari(simdi);
  if (d.gunluk.gun === bugun) return d;
  const onceki = d.seri.son;
  const dun = gunAnahtari(new Date(simdi.getTime() - 86_400_000));
  const seriSurer = onceki === bugun || onceki === dun;
  return {
    ...d,
    gunluk: { gun: bugun, yeni: 0, tekrar: 0, dogru: 0 },
    seri: seriSurer ? d.seri : { ...d.seri, gun: 0 },
  };
}

export const ayarlaDepo = (d: Depo, ayar: Partial<Depo['ayar']>): Depo => ({
  ...d,
  ayar: { ...d.ayar, ...ayar },
});

export function fsrsAyarlari(d: Depo): Ayarlar {
  return { ...varsayilanAyarlar, hedefHatirlama: d.ayar.hedefHatirlama };
}

export function kartDurumunaCevir(k: DepoKarti): KartDurumu {
  return {
    due: new Date(k.due),
    stability: k.stability,
    difficulty: k.difficulty,
    elapsedDays: k.elapsedDays,
    scheduledDays: k.scheduledDays,
    reps: k.reps,
    lapses: k.lapses,
    state: k.state as Durum,
    lastReview: k.lastReview ? new Date(k.lastReview) : null,
  };
}

function depoKartinaCevir(k: KartDurumu, sonDerece: Derece): DepoKarti {
  return {
    due: k.due.toISOString(),
    stability: k.stability,
    difficulty: k.difficulty,
    elapsedDays: k.elapsedDays,
    scheduledDays: k.scheduledDays,
    reps: k.reps,
    lapses: k.lapses,
    state: k.state,
    lastReview: k.lastReview ? k.lastReview.toISOString() : null,
    sonDerece,
  };
}

/** Records one rating for a card: FSRS update, daily counters and streak. */
export function degerlendir(d: Depo, kartId: string, derece: Derece, simdi: Date): Depo {
  const guncel = gunuYenile(d, simdi);
  const onceki = guncel.kartlar[kartId];
  const durum = onceki ? kartDurumunaCevir(onceki) : yeniKart(simdi);
  const yeniMi = durum.state === Durum.Yeni;
  const sonraki = incele(durum, derece, simdi, fsrsAyarlari(guncel));
  const bugun = gunAnahtari(simdi);
  const dun = gunAnahtari(new Date(simdi.getTime() - 86_400_000));
  const seriGun =
    guncel.seri.son === bugun ? guncel.seri.gun : guncel.seri.son === dun ? guncel.seri.gun + 1 : 1;
  return {
    ...guncel,
    kartlar: { ...guncel.kartlar, [kartId]: depoKartinaCevir(sonraki, derece) },
    gunluk: {
      ...guncel.gunluk,
      yeni: guncel.gunluk.yeni + (yeniMi ? 1 : 0),
      tekrar: guncel.gunluk.tekrar + (yeniMi ? 0 : 1),
      dogru: guncel.gunluk.dogru + (derece >= Derece.Zor ? 1 : 0),
    },
    seri: { son: bugun, gun: seriGun, enUzun: Math.max(guncel.seri.enUzun, seriGun) },
  };
}

export interface CalismaKuyrugu {
  /** Cards due today, most overdue first. Not limited. */
  tekrar: string[];
  /** New cards allowed today, in deck order. */
  yeni: string[];
  /** New cards still waiting after the daily limit. */
  yeniBekleyen: number;
}

/** The study queue of a set of card ids: due reviews first, then new cards up to the daily limit. */
export function calismaKuyrugu(kartIdleri: readonly string[], d: Depo, simdi: Date): CalismaKuyrugu {
  const guncel = gunuYenile(d, simdi);
  const ayar = fsrsAyarlari(guncel);
  const tekrar = kartIdleri
    .filter((id) => {
      const k = guncel.kartlar[id];
      return k !== undefined && vadesiGeldiMi(kartDurumunaCevir(k), simdi, ayar);
    })
    .sort(
      (a, b) =>
        Date.parse((guncel.kartlar[a] as DepoKarti).due) - Date.parse((guncel.kartlar[b] as DepoKarti).due) ||
        a.localeCompare(b),
    );
  const yeniler = kartIdleri.filter((id) => guncel.kartlar[id] === undefined);
  const hak = Math.max(0, guncel.ayar.yeniKartSiniri - guncel.gunluk.yeni);
  return { tekrar, yeni: yeniler.slice(0, hak), yeniBekleyen: Math.max(0, yeniler.length - hak) };
}

export interface DesteIlerlemesi {
  toplam: number;
  yeni: number;
  ogrenilen: number;
  vadesiGelen: number;
  /** Mean retrievability proxy: share of reviewed cards whose last rating was not Again. */
  basariOrani: number | null;
}

export function desteIlerlemesi(kartIdleri: readonly string[], d: Depo, simdi: Date): DesteIlerlemesi {
  const ayar = fsrsAyarlari(d);
  let ogrenilen = 0;
  let vadesiGelen = 0;
  let basarili = 0;
  for (const id of kartIdleri) {
    const k = d.kartlar[id];
    if (!k) continue;
    ogrenilen++;
    if (vadesiGeldiMi(kartDurumunaCevir(k), simdi, ayar)) vadesiGelen++;
    if (k.sonDerece !== null && k.sonDerece >= Derece.Zor) basarili++;
  }
  return {
    toplam: kartIdleri.length,
    yeni: kartIdleri.length - ogrenilen,
    ogrenilen,
    vadesiGelen,
    basariOrani: ogrenilen ? basarili / ogrenilen : null,
  };
}

/** Cards whose last rating was Again, newest first: the global "retry my wrong answers" list. */
export function yanlisKartlar(d: Depo): string[] {
  return Object.entries(d.kartlar)
    .filter(([, k]) => k.sonDerece === Derece.Tekrar)
    .sort(([, a], [, b]) => Date.parse(b.lastReview ?? b.due) - Date.parse(a.lastReview ?? a.due))
    .map(([id]) => id);
}

export function denemeKaydet(d: Depo, kayit: DenemeKaydi): Depo {
  return { ...d, denemeler: [kayit, ...d.denemeler].slice(0, 50) };
}

/**
 * Puts cards into the repeat deck after an exam (plan 10.6/3: wrong answers fall into the repeat deck): each card
 * is rated Again. The daily new card counters are not touched, so an exam does not use up the day's new card quota.
 */
export function tekrarDestesineEkle(d: Depo, kartIdleri: readonly string[], simdi: Date): Depo {
  let sonuc = gunuYenile(d, simdi);
  const gunluk = sonuc.gunluk;
  for (const id of kartIdleri) sonuc = degerlendir(sonuc, id, Derece.Tekrar, simdi);
  return { ...sonuc, gunluk };
}
