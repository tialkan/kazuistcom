import tr from '@kazuist/i18n/tr/rehberler.json';
import type { Adim } from '../_alan/sema.ts';

export { tr };

/** Fills {name} placeholders of a dictionary string. */
export function doldur(sablon: string, degerler: Record<string, string | number>): string {
  return sablon.replace(/\{(\w+)\}/g, (_, ad: string) => String(degerler[ad] ?? `{${ad}}`));
}

export const tarihTr = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(
    new Date(`${iso}T12:00:00+03:00`),
  );

export interface AdimGorunumu {
  id: string;
  no: number;
  baslik: string;
  aciklama: string;
  ipucu?: string;
  baglanti: { href: string; etiket: string } | null;
  /** Label of the search button, or null when the step has none. */
  araEtiket: string | null;
  dayanak: { kisa: string; not: string; dogrulama: 'birincil' | 'ikincil' } | null;
}

export function adimGorunumu(
  adim: Adim,
  no: number,
  kaynak?: { kisa: string; dogrulama: 'birincil' | 'ikincil' },
): AdimGorunumu {
  return {
    id: adim.id,
    no,
    baslik: adim.baslik,
    aciklama: adim.aciklama,
    ipucu: adim.ipucu,
    baglanti: adim.baglanti ?? null,
    araEtiket: adim.kaynakTuru ? tr.adim.ara[adim.kaynakTuru] : null,
    dayanak:
      kaynak && adim.dayanakNotu
        ? { kisa: kaynak.kisa, not: adim.dayanakNotu, dogrulama: kaynak.dogrulama }
        : null,
  };
}
