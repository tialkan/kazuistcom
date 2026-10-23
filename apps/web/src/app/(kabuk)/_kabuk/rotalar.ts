import type { OrtakSozluk } from '@kazuist/i18n';

/** The seven module tabs of SRS section 2, in SRS order, with the frozen routes of plan 13.1. */
export const moduller = [
  { anahtar: 'ara', href: '/ara' },
  { anahtar: 'atifAgi', href: '/atif-agi' },
  { anahtar: 'rehberler', href: '/rehberler' },
  { anahtar: 'yazma', href: '/yazma' },
  { anahtar: 'pratik', href: '/pratik' },
  { anahtar: 'kampus', href: '/kampus' },
  { anahtar: 'kaydettiklerim', href: '/kaydettiklerim' },
] as const satisfies readonly { anahtar: keyof OrtakSozluk['gezinme']['sekme']; href: string }[];

/**
 * Modules whose routes are live. A module agent adds its href here in the PR that ships the route;
 * closed modules render as "yakında" text instead of a link, so no link points at a 404
 * (docs/istekler/kalite-on-yuz-baglantilar.md).
 */
export const acikModuller: ReadonlySet<string> = new Set<string>([]);
export const modulAcik = (href: string) => acikModuller.has(href);

/** Legal documents of plan 11 served under /hukuki/<slug>. */
export const hukukiBelgeler = [
  'uyari',
  'aydinlatma',
  'gizlilik',
  'cerezler',
  'yapay-zeka',
  'kosullar',
  'iade-ve-kredi',
  'erisilebilirlik',
  'topluluk',
  'kaldirma',
  'basvuru',
] as const satisfies readonly (keyof OrtakSozluk['hukuki']['belge'])[];
export type HukukiBelge = (typeof hukukiBelgeler)[number];

/** True when `path` is the module root or below it. */
export const etkinMi = (path: string, href: string) => path === href || path.startsWith(`${href}/`);
