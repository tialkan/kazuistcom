export const locales = ['tr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const sourceLocale: Locale = 'tr';

type Dict = { [key: string]: string | Dict };

/** Flatten nested dictionary keys to dotted paths. */
export function flattenKeys(dict: Dict, prefix = ''): string[] {
  return Object.entries(dict).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : flattenKeys(v, `${prefix}${k}.`),
  );
}

/** Turkish aware upper case (CLAUDE.md metin kurallari). */
export const upperTr = (s: string): string => s.toLocaleUpperCase('tr-TR');
