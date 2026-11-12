import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { robotsYonergesi, siteKoku, type SeoEnv } from './ortam.ts';

/**
 * Site wide search metadata for the root layout: base URL, title template, robots by environment,
 * canonical and OpenGraph. Pages override single keys (title, description, robots); a page that sets
 * its own `alternates` or `openGraph` replaces the whole key, so it must repeat what it needs.
 *
 * The canonical is relative ('./'): Next resolves it against metadataBase and the page path, so every
 * page points at its own address without a query string. There is no hreflang (ADR-0032).
 * OpenGraph images are not set yet; the request is docs/istekler/seo-p6-og-gorseli.md.
 */
export function temelMetadata(env: SeoEnv = process.env): Metadata {
  const marka = ortak().marka;
  return {
    metadataBase: new URL(siteKoku(env)),
    title: { template: `%s | ${marka}`, default: marka },
    robots: robotsYonergesi(env),
    alternates: { canonical: './' },
    openGraph: { type: 'website', siteName: marka, locale: 'tr_TR' },
    twitter: { card: 'summary' },
  };
}
