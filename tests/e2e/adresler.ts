/**
 * plan Ek H: the 23 protected addresses. `to` is set for the single 301 rows (18-22). `gone` marks the
 * English Casuist pages removed without a redirect by ADR-0032 (rows 2-11): they answer 404.
 */
export interface Korunan {
  no: number;
  path: string;
  to?: string;
  gone?: true;
}

export const EK_H: readonly Korunan[] = [
  { no: 1, path: '/' },
  { no: 2, path: '/problem', gone: true },
  { no: 3, path: '/how-it-works', gone: true },
  { no: 4, path: '/evaluation', gone: true },
  { no: 5, path: '/partner', gone: true },
  { no: 6, path: '/about', gone: true },
  { no: 7, path: '/legal/notice', gone: true },
  { no: 8, path: '/legal/privacy', gone: true },
  { no: 9, path: '/legal/cookies', gone: true },
  { no: 10, path: '/legal/ai', gone: true },
  { no: 11, path: '/legal/accessibility', gone: true },
  { no: 12, path: '/tr' },
  { no: 13, path: '/tr/sorun' },
  { no: 14, path: '/tr/nasil-calisir' },
  { no: 15, path: '/tr/degerlendirme' },
  { no: 16, path: '/tr/ortak' },
  { no: 17, path: '/tr/hakkinda' },
  { no: 18, path: '/tr/hukuki/uyari', to: '/hukuki/uyari' },
  { no: 19, path: '/tr/hukuki/gizlilik', to: '/hukuki/gizlilik' },
  { no: 20, path: '/tr/hukuki/cerezler', to: '/hukuki/cerezler' },
  { no: 21, path: '/tr/hukuki/yapay-zeka', to: '/hukuki/yapay-zeka' },
  { no: 22, path: '/tr/hukuki/erisilebilirlik', to: '/hukuki/erisilebilirlik' },
  { no: 23, path: '/eski' },
];

/** Casuist pages kept as they are (Ek H rows 12-17, 23). */
export const CASUIST: readonly string[] = [
  '/tr',
  '/tr/sorun',
  '/tr/nasil-calisir',
  '/tr/degerlendirme',
  '/tr/ortak',
  '/tr/hakkinda',
  '/eski',
];

/** content/hukuki/tr slugs rendered under /hukuki/<slug> (plan 11). */
export const HUKUKI_TR: readonly string[] = [
  'abonelik',
  'acik-riza',
  'aydinlatma',
  'basvuru',
  'cerezler',
  'erisilebilirlik',
  'gizlilik',
  'iade-ve-kredi',
  'kaldirma',
  'kosullar',
  'mesafeli-satis',
  'on-bilgilendirme',
  'uyari',
  'yapay-zeka',
];

/** English addresses removed without a redirect (ADR-0032): Ek H rows 2-11 and the former /en home. */
export const KALDIRILAN_EN: readonly string[] = ['/en', ...EK_H.filter((r) => r.gone).map((r) => r.path)];

/** Pages that must pass axe and the overflow check (plan 15.1 "ana sayfalarda axe"). */
export const ANA_SAYFALAR: readonly string[] = [
  '/',
  '/fiyatlar',
  '/hukuki',
  '/hukuki/aydinlatma',
  '/hukuki/kosullar',
  '/giris',
  '/kayit',
  '/tr',
  '/tr/hakkinda',
  '/eski',
];
