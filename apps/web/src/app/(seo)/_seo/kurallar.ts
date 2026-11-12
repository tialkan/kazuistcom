import type { MetadataRoute } from 'next';
import { siteHaritasiAdresleri } from './adresler.ts';
import { indekslenebilir, siteKoku, type SeoEnv } from './ortam.ts';

/** Search and citation bots allowed in production (plan 13.2/6). */
export const aramaBotlari = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-SearchBot',
  'Claude-User',
  'Googlebot',
  'Bingbot',
] as const;

/** Training bots kept out of the corpus pages (plan 13.2/6; the reason is database labour, FSEK ek m.8). */
export const egitimBotlari = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot'] as const;

/** Corpus page prefixes of plan 13.1: legislation, decisions, institution decisions, article records. */
export const corpusYollari = ['/mevzuat/', '/karar/', '/kurum-karari/', '/makale/'] as const;

/** Never crawled by anyone: the API, the admin panel and the payment flow. */
export const ozelYollar = ['/api/', '/yonetim', '/odeme'] as const;

export function robotsKurallari(env: SeoEnv = process.env): MetadataRoute.Robots {
  // Closed by default: staging, development and any unconfirmed environment (review.md P6/1).
  if (!indekslenebilir(env)) return { rules: { userAgent: '*', disallow: '/' } };
  // A bot with its own group ignores the `*` group, so each group repeats the private paths.
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: [...ozelYollar] },
      { userAgent: [...aramaBotlari], allow: '/', disallow: [...ozelYollar] },
      { userAgent: [...egitimBotlari], allow: '/', disallow: [...ozelYollar, ...corpusYollari] },
    ],
    sitemap: `${siteKoku(env)}/sitemap.xml`,
  };
}

/** The sitemap lists the same public pages in every environment; robots.txt decides who may read it. */
export function siteHaritasi(env: SeoEnv = process.env): MetadataRoute.Sitemap {
  const koku = siteKoku(env);
  return siteHaritasiAdresleri().map(({ yol, lastModified }) => ({
    url: yol === '/' ? koku : `${koku}${yol}`,
    ...(lastModified ? { lastModified } : {}),
  }));
}
