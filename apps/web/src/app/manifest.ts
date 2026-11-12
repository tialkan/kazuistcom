import type { MetadataRoute } from 'next';
import { ortak } from '@kazuist/i18n';
import { manifestSimgeleri, markaRenkleri } from './(kabuk)/_marka/marka.ts';

/** Web app manifest (plan 12/14, wt.25). Light theme only (K-15), so one paper colour for both fields. */
export default function manifest(): MetadataRoute.Manifest {
  const o = ortak();
  return {
    name: o.marka,
    short_name: o.marka,
    description: o.amac,
    lang: 'tr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: markaRenkleri.kagit,
    theme_color: markaRenkleri.kagit,
    icons: manifestSimgeleri.map((s) => ({ ...s })),
  };
}
