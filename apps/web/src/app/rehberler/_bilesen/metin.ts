import tr from '@kazuist/i18n/tr/rehberler.json';
import { modulAcik } from '../../(kabuk)/_kabuk/rotalar.ts';
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

/**
 * A link inside the guides is shown only when its target exists: /tespit and the guide pages always, a module
 * route (/yazma) once the shell lists it as open. Closed targets are left out instead of linking to a 404.
 */
export const baglantiAcik = (href: string) => !href.startsWith('/yazma') || modulAcik('/yazma');

/** Source search needs the /ara module; the button is left out while it is closed. */
export const aramaAcik = () => modulAcik('/ara');

export interface AdimGorunumu {
  id: string;
  no: number;
  baslik: string;
  aciklama: string;
  ipucu?: string;
  baglanti: { href: string; etiket: string } | null;
  /** Label of the search button, or null when the step has none or search is closed. */
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
    baglanti: adim.baglanti && baglantiAcik(adim.baglanti.href) ? adim.baglanti : null,
    araEtiket: adim.kaynakTuru && aramaAcik() ? tr.adim.ara[adim.kaynakTuru] : null,
    dayanak:
      kaynak && adim.dayanakNotu
        ? { kisa: kaynak.kisa, not: adim.dayanakNotu, dogrulama: kaynak.dogrulama }
        : null,
  };
}
