import trOrtak from '../tr/ortak.json' with { type: 'json' };

/** Kazuist is Turkish only (ADR-0032): one dictionary per module under tr/, no locale switch. */

type Dict = { [key: string]: string | Dict };

/** Flatten nested dictionary keys to dotted paths. */
export function flattenKeys(dict: Dict, prefix = ''): string[] {
  return Object.entries(dict).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : flattenKeys(v, `${prefix}${k}.`),
  );
}

/** Shared UI strings. The type comes from tr/ortak.json, so a missing key fails the type check. */
export type OrtakSozluk = typeof trOrtak;
export const ortak = (): OrtakSozluk => trOrtak;

/** Turkish aware case mapping (CLAUDE.md metin kurallari). Never use bare toUpperCase on Turkish text. */
export const upperTr = (s: string): string => s.toLocaleUpperCase('tr-TR');
export const lowerTr = (s: string): string => s.toLocaleLowerCase('tr-TR');

/** Turkish number formatting, e.g. 1.000 and 0,130 (wt.93). */
export const sayiTr = (n: number, kesir = 0): string =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: kesir, maximumFractionDigits: kesir }).format(n);
