import type { OrtakSozluk } from '@kazuist/i18n';

/**
 * Module tabs of SRS section 2, in SRS order, with the frozen routes of plan 13.1. Turkuaz Kampus
 * is out of scope (ADR-0031), so the bar has six tabs.
 */
export const moduller = [
  { anahtar: 'ara', href: '/ara' },
  { anahtar: 'atifAgi', href: '/atif-agi' },
  { anahtar: 'rehberler', href: '/rehberler' },
  { anahtar: 'yazma', href: '/yazma' },
  { anahtar: 'pratik', href: '/pratik' },
  { anahtar: 'kaydettiklerim', href: '/kaydettiklerim' },
] as const satisfies readonly { anahtar: keyof OrtakSozluk['gezinme']['sekme']; href: string }[];

// Every module ships at launch (ADR-0033, review.md T2): there is no closed module and no "yakında" marker,
// so `moduller` is the only list; there is no separate open-module set.

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
