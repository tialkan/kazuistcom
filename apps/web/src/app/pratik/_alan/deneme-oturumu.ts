/**
 * The running exam kept in the browser, so a refresh or a closed tab does not lose it and the clock keeps running
 * (`baslangic` is a wall clock instant). Pure parsing and finishing logic; the component does the I/O.
 */
import { z } from 'zod';
import { denemeKaydet, tekrarDestesineEkle, type DenemeKaydi, type Depo } from './depo.ts';
import { denemeKur, denemePuanla, sureDoldu, type DenemePlani, type DenemeSonucu } from './deneme.ts';
import type { KartGorunumu } from './kart.ts';

export const denemeAnahtari = 'kazuist.pratik.deneme.v1';

const saklananSchema = z.object({
  tohum: z.number().int().min(0),
  baslangic: z.number().int().positive(),
  idler: z.array(z.string()).min(1),
  cevaplar: z.array(z.number().int().min(0).max(4).nullable()),
  isaretler: z.array(z.boolean()),
  sira: z.number().int().min(0),
});
export type SaklananDeneme = z.infer<typeof saklananSchema>;

export function yeniDeneme(plan: DenemePlani, tohum: number, simdi: number): SaklananDeneme {
  return {
    tohum,
    baslangic: simdi,
    idler: plan.sorular.map((s) => s.id),
    cevaplar: plan.sorular.map(() => null),
    isaretler: plan.sorular.map(() => false),
    sira: 0,
  };
}

/** Reads a stored exam; null when it is damaged or the pool changed so the same questions cannot be rebuilt. */
export function denemeyiOku(
  ham: string | null,
  havuz: readonly KartGorunumu[],
): { saklanan: SaklananDeneme; plan: DenemePlani } | null {
  if (!ham) return null;
  try {
    const s = saklananSchema.safeParse(JSON.parse(ham));
    if (!s.success) return null;
    const plan = denemeKur(havuz, s.data.tohum);
    const ayni =
      plan.sorular.length === s.data.idler.length && plan.sorular.every((q, i) => q.id === s.data.idler[i]);
    const uzunluk =
      s.data.cevaplar.length === plan.sorular.length && s.data.isaretler.length === plan.sorular.length;
    return ayni && uzunluk ? { saklanan: s.data, plan } : null;
  } catch {
    return null;
  }
}

export const sureBittiMi = (s: SaklananDeneme, plan: DenemePlani, simdi: number) =>
  sureDoldu(s.baslangic, plan.sureDakika, simdi);

export interface BitisSonucu {
  sonuc: DenemeSonucu;
  depo: Depo;
  gecenDakika: number;
}

/** Scores the exam, writes it to the history and puts the wrong and blank cards into the repeat deck. */
export function denemeyiBitir(d: Depo, plan: DenemePlani, s: SaklananDeneme, simdi: number): BitisSonucu {
  const sonuc = denemePuanla(plan.sorular, s.cevaplar);
  const gecenDakika = Math.min(plan.sureDakika, Math.max(0, (simdi - s.baslangic) / 60_000));
  const kayit: DenemeKaydi = {
    tarih: new Date(simdi).toISOString(),
    soruSayisi: sonuc.soruSayisi,
    dogru: sonuc.dogru,
    puan: sonuc.puan,
    tam: plan.tam,
    gecenDakika,
    baraj: sonuc.baraj,
    alanlar: Object.fromEntries(sonuc.alanlar.map((a) => [a.slug, { dogru: a.dogru, toplam: a.toplam }])),
  };
  const yeniDepo = tekrarDestesineEkle(denemeKaydet(d, kayit), sonuc.tekrarKartlari, new Date(simdi));
  return { sonuc, depo: yeniDepo, gecenDakika };
}
