import tr from '@kazuist/i18n/tr/atif-agi.json';

export { tr };

/** Fills {name} placeholders of a dictionary string. */
export function doldur(sablon: string, degerler: Record<string, string | number>): string {
  return sablon.replace(/\{(\w+)\}/g, (_, ad: string) => String(degerler[ad] ?? `{${ad}}`));
}

export const tarihTr = (iso: string | null | undefined): string =>
  iso
    ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(
        new Date(iso),
      )
    : '';

export const sayiTr = (n: number): string => new Intl.NumberFormat('tr-TR').format(n);

/** Page markers of one citation: "s. 373, s. 380". */
export const sayfalarMetni = (sayfalar: string[]): string =>
  sayfalar.map((s) => doldur(tr.detay.sayfa, { sayfa: s })).join(', ');
