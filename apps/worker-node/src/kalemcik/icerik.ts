import { createHash } from 'node:crypto';
import { z } from 'zod';
import veri from './_veri/kalemcik.json' with { type: 'json' };

/**
 * Kalemcik's messages (plan 10.5/6, SRS FR-53 and FR-54). The source is content/kalemcik.yaml; _veri/kalemcik.json is
 * its generated copy (apps/web/src/app/yazma/_veri/uret.ts) and a test fails when the two differ. Every message
 * has two voices: "sen" (Kalemcik's own, the default) and "siz" (the user's choice).
 */

export const hitaplar = ['sen', 'siz'] as const;
export type Hitap = (typeof hitaplar)[number];

const Ses = z.strictObject({ sen: z.string().min(1), siz: z.string().min(1) });
const Teslim = z.strictObject({ baslik: Ses, metin: z.array(Ses).min(1) });

const Ton = z.strictObject({ renk: z.string(), yuz: z.string(), mesajlar: z.array(Ses).min(1) });

export const Icerik = z.strictObject({
  surum: z.string(),
  durum: z.string(),
  tonlar: z.strictObject({ iyi: Ton, son7: Ton, yazilmadi: Ton, hedef: Ton }),
  teslim: z.strictObject({ '14': Teslim, '7': Teslim, '3': Teslim, '1': Teslim, '0': Teslim }),
  sessizlik: Teslim,
});
export type IcerikVerisi = z.infer<typeof Icerik>;

export const icerik: IcerikVerisi = Icerik.parse(veri);

export interface Degiskenler {
  calisma: string;
  kalan: number;
  gunluk: number;
  gun: number;
  sessiz: number;
}

const sayi = (n: number) => new Intl.NumberFormat('tr-TR').format(n);

/**
 * Fill {placeholders}; an unknown placeholder is left out, never printed raw. A placeholder that opens a sentence
 * (at the start of the text or after ". ", "! ", "? ") is filled with a capital first letter.
 */
export function doldur(metin: string, d: Partial<Degiskenler>): string {
  const cumleBasi = metin.replace(/(^|[.!?]\s+)\{calisma\}/g, '$1{Calisma}');
  return cumleBasi.replace(/\{(calisma|Calisma|kalan|gunluk|gun|sessiz)\}/g, (_m, k: string) => {
    if (k === 'Calisma') return ilkHarfBuyuk(d.calisma ?? '');
    const v = d[k as keyof Degiskenler];
    return v === undefined ? '' : typeof v === 'number' ? sayi(v) : v;
  });
}

/** First letter in capitals with the Turkish rule (the text may start with a filled placeholder). */
export const ilkHarfBuyuk = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s);

/** Stable pick: the same project on the same day always gets the same variant (a rerun repeats nothing new). */
export function varyant(tohum: string, adet: number): number {
  if (adet <= 1) return 0;
  return createHash('sha256').update(tohum).digest().readUInt32BE(0) % adet;
}
