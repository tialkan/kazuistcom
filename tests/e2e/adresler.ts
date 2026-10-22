/** plan Ek H: the 23 protected addresses. `to` is set for the single 301 rows (18-22). */
export interface Korunan {
  no: number;
  path: string;
  to?: string;
}

export const EK_H: readonly Korunan[] = [
  { no: 1, path: '/' },
  { no: 2, path: '/problem' },
  { no: 3, path: '/how-it-works' },
  { no: 4, path: '/evaluation' },
  { no: 5, path: '/partner' },
  { no: 6, path: '/about' },
  { no: 7, path: '/legal/notice' },
  { no: 8, path: '/legal/privacy' },
  { no: 9, path: '/legal/cookies' },
  { no: 10, path: '/legal/ai' },
  { no: 11, path: '/legal/accessibility' },
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

/** Casuist pages kept as they are (Ek H rows 2-6, 12-17, 23) and the new /en home. */
export const CASUIST: readonly string[] = [
  '/en',
  '/problem',
  '/how-it-works',
  '/evaluation',
  '/partner',
  '/about',
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
  'topluluk',
  'uyari',
  'yapay-zeka',
];

/** content/hukuki/en slugs rendered under /legal/<slug> (Ek H rows 7-11). */
export const HUKUKI_EN: readonly string[] = ['notice', 'privacy', 'cookies', 'ai', 'accessibility'];

/** Pages that must pass axe and the overflow check (plan 15.1 "ana sayfalarda axe"). */
export const ANA_SAYFALAR: readonly string[] = [
  '/',
  '/fiyatlar',
  '/hukuki',
  '/hukuki/aydinlatma',
  '/hukuki/kosullar',
  '/giris',
  '/kayit',
  '/en',
  '/problem',
  '/tr',
  '/tr/hakkinda',
  '/legal/privacy',
  '/eski',
];
