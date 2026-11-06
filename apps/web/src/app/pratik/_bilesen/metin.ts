import tr from '@kazuist/i18n/tr/pratik.json';
import type { Oyun } from '../_alan/kart.ts';

export { tr };

/** Fills {name} placeholders of a dictionary string. */
export function doldur(sablon: string, degerler: Record<string, string | number>): string {
  return sablon.replace(/\{(\w+)\}/g, (_, ad: string) => String(degerler[ad] ?? `{${ad}}`));
}

export const oyunMetni = (oyun: Oyun) => {
  const o = tr.oyunlar;
  switch (oyun) {
    case 'olay_karti':
      return o.olayKarti;
    case 'hala_gecerli_mi':
      return o.halaGecerliMi;
    case 'dogru_yanlis':
      return o.dogruYanlis;
    case 'hangisi_once':
      return o.hangisiOnce;
  }
};

export const tarihTr = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(new Date(iso));

export const sayiTr = (n: number, kesir = 0) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: kesir, maximumFractionDigits: kesir }).format(n);
