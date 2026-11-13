import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moduller } from '../src/app/(kabuk)/_kabuk/rotalar.ts';
import { sayfaDosyasi, siteHaritasiDisiModuller } from '../src/app/(seo)/_seo/adresler.ts';
import {
  aramaBotlari,
  corpusYollari,
  egitimBotlari,
  ozelYollar,
  robotsKurallari,
  siteHaritasi,
} from '../src/app/(seo)/_seo/kurallar.ts';
import { temelMetadata } from '../src/app/(seo)/_seo/metadata.ts';
import { indekslenebilir, robotsYonergesi, siteKoku } from '../src/app/(seo)/_seo/ortam.ts';

const uretim = { NODE_ENV: 'production', KAZUIST_ENV: 'production', APP_URL: 'https://kazuist.com' };
const appKok = fileURLToPath(new URL('../src/app', import.meta.url));
const dosya = (yol: string) => readFileSync(fileURLToPath(new URL(yol, import.meta.url)), 'utf8');

/** Addresses removed by ADR-0032 (Ek H rows 2-11 and /en): they answer 404 and must never be advertised. */
const kaldirilanIngilizceYollar = [
  '/en',
  '/problem',
  '/how-it-works',
  '/evaluation',
  '/partner',
  '/about',
  '/legal/notice',
  '/legal/privacy',
  '/legal/cookies',
  '/legal/ai',
  '/legal/accessibility',
];

type Kural = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] };
const kurallar = (env: Record<string, string | undefined>): Kural[] => {
  const r = robotsKurallari(env).rules;
  return Array.isArray(r) ? r : [r];
};
const grup = (k: Kural[], bot: string) =>
  k.find((x) => (Array.isArray(x.userAgent) ? x.userAgent : [x.userAgent]).includes(bot));
const liste = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

describe('noindex is the default', () => {
  it('stays closed for every environment that is not confirmed production', () => {
    const kapali: Record<string, string | undefined>[] = [
      {},
      { NODE_ENV: 'production' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'production' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'staging', APP_URL: 'https://staging.kazuist.com' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'production', APP_URL: 'https://staging.kazuist.com' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'production', APP_URL: 'http://kazuist.com' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'production', APP_URL: 'https://www.kazuist.com' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'production', APP_URL: 'bu bir adres degil' },
      { NODE_ENV: 'development', KAZUIST_ENV: 'production', APP_URL: 'https://kazuist.com' },
      { NODE_ENV: 'test', KAZUIST_ENV: 'production', APP_URL: 'https://kazuist.com' },
      { NODE_ENV: 'production', KAZUIST_ENV: 'Production', APP_URL: 'https://kazuist.com' },
    ];
    for (const env of kapali) {
      expect(indekslenebilir(env), JSON.stringify(env)).toBe(false);
      expect(robotsYonergesi(env)).toEqual({ index: false, follow: false });
      expect(temelMetadata(env).robots).toEqual({ index: false, follow: false });
    }
  });

  it('opens only when NODE_ENV, KAZUIST_ENV and the production host agree', () => {
    expect(indekslenebilir(uretim)).toBe(true);
    expect(robotsYonergesi(uretim)).toEqual({ index: true, follow: true });
    expect(temelMetadata(uretim).robots).toEqual({ index: true, follow: true });
  });

  it('reads the process environment when no argument is given, and the test run is closed', () => {
    expect(indekslenebilir()).toBe(false);
    expect(temelMetadata().robots).toEqual({ index: false, follow: false });
  });

  it('keeps the root layout free of an unconditional robots value', () => {
    const layout = dosya('../src/app/layout.tsx');
    expect(layout).toContain('temelMetadata()');
    expect(layout).not.toMatch(/robots\s*:/);
  });
});

describe('site metadata', () => {
  it('sets metadataBase, the title template and a relative canonical, with no hreflang', () => {
    const m = temelMetadata(uretim);
    expect(String(m.metadataBase)).toBe('https://kazuist.com/');
    expect(m.title).toEqual({ template: '%s | Kazuist', default: 'Kazuist' });
    expect(m.alternates).toEqual({ canonical: './' });
    expect(m.alternates).not.toHaveProperty('languages');
  });

  it('declares Turkish OpenGraph and the large Twitter card; the image comes from app/opengraph-image.tsx', () => {
    const m = temelMetadata(uretim);
    expect(m.openGraph).toMatchObject({ type: 'website', siteName: 'Kazuist', locale: 'tr_TR' });
    // the image is a file convention route, so the metadata must not list a second one
    expect(m.openGraph).not.toHaveProperty('images');
    expect(m.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(
      readFileSync(fileURLToPath(new URL('../src/app/opengraph-image.tsx', import.meta.url)), 'utf8'),
    ).toContain('export default');
  });

  it('uses the configured origin in staging and localhost without APP_URL', () => {
    expect(siteKoku({ APP_URL: 'https://staging.kazuist.com/' })).toBe('https://staging.kazuist.com');
    expect(siteKoku({})).toBe('http://localhost:3000');
    expect(siteKoku({ APP_URL: 'ftp://x' })).toBe('http://localhost:3000');
  });
});

describe('robots.txt policy', () => {
  it('disallows everything and lists no sitemap outside production', () => {
    for (const env of [
      {},
      { NODE_ENV: 'production', KAZUIST_ENV: 'staging', APP_URL: 'https://s.kazuist.com' },
    ]) {
      const r = robotsKurallari(env);
      expect(r.rules).toEqual({ userAgent: '*', disallow: '/' });
      expect(r.sitemap).toBeUndefined();
    }
  });

  it('allows the search and citation bots in production and points at the sitemap', () => {
    const r = robotsKurallari(uretim);
    expect(r.sitemap).toBe('https://kazuist.com/sitemap.xml');
    const k = kurallar(uretim);
    for (const bot of aramaBotlari) {
      const g = grup(k, bot);
      expect(g, bot).toBeDefined();
      expect(liste(g?.allow)).toEqual(['/']);
      expect(liste(g?.disallow)).toEqual([...ozelYollar]);
      for (const yol of corpusYollari) expect(liste(g?.disallow)).not.toContain(yol);
    }
    expect(aramaBotlari).toEqual([
      'OAI-SearchBot',
      'ChatGPT-User',
      'PerplexityBot',
      'Perplexity-User',
      'Claude-SearchBot',
      'Claude-User',
      'Googlebot',
      'Bingbot',
    ]);
  });

  it('blocks the training bots on corpus pages only, not site wide', () => {
    const k = kurallar(uretim);
    for (const bot of egitimBotlari) {
      const g = grup(k, bot);
      expect(g, bot).toBeDefined();
      expect(liste(g?.allow)).toEqual(['/']);
      for (const yol of corpusYollari) expect(liste(g?.disallow)).toContain(yol);
      expect(liste(g?.disallow)).not.toContain('/');
    }
    expect([...egitimBotlari]).toEqual(['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot']);
  });

  it('keeps the API, admin and payment paths closed for every group', () => {
    for (const g of kurallar(uretim)) for (const yol of ozelYollar) expect(liste(g.disallow)).toContain(yol);
  });

  it('never disallows the whole site in production and covers every bot exactly once', () => {
    const k = kurallar(uretim);
    for (const g of k) expect(liste(g.disallow)).not.toContain('/');
    const adlar = k.flatMap((g) => liste(g.userAgent));
    expect(new Set(adlar).size).toBe(adlar.length);
  });
});

describe('sitemap', () => {
  const harita = siteHaritasi(uretim);
  const yollar = harita.map((e) => new URL(e.url).pathname);

  it('lists absolute production URLs without duplicates, query strings or trailing slashes', () => {
    expect(harita.length).toBeGreaterThan(20);
    for (const e of harita) {
      const u = new URL(e.url);
      expect(u.origin).toBe('https://kazuist.com');
      expect(u.search).toBe('');
      expect(u.hash).toBe('');
      if (u.pathname !== '/') expect(u.pathname.endsWith('/')).toBe(false);
    }
    expect(new Set(yollar).size).toBe(yollar.length);
    expect(yollar[0]).toBe('/');
  });

  it('lists no English address removed by ADR-0032 and no hreflang alternates', () => {
    for (const yol of kaldirilanIngilizceYollar) {
      expect(yollar, yol).not.toContain(yol);
      expect(
        yollar.some((y) => y.startsWith(`${yol}/`)),
        yol,
      ).toBe(false);
    }
    expect(yollar.some((y) => y.startsWith('/legal'))).toBe(false);
    expect(yollar.some((y) => y.startsWith('/en/'))).toBe(false);
    for (const e of harita) expect(e).not.toHaveProperty('alternates');
  });

  it('keeps the protected Turkish Casuist pages and leaves out /eski and the 301 sources', () => {
    for (const yol of [
      '/tr',
      '/tr/sorun',
      '/tr/nasil-calisir',
      '/tr/degerlendirme',
      '/tr/ortak',
      '/tr/hakkinda',
    ]) {
      expect(yollar).toContain(yol);
    }
    expect(yollar).not.toContain('/eski');
    expect(yollar.some((y) => y.startsWith('/tr/hukuki'))).toBe(false);
  });

  it('follows rotalar.ts: every open module root is listed unless it is explicitly excluded', () => {
    for (const { href } of moduller) {
      if (siteHaritasiDisiModuller.has(href)) expect(yollar, href).not.toContain(href);
      else expect(yollar, href).toContain(href);
    }
    expect(yollar).not.toContain('/kaydettiklerim');
  });

  it('lists only pages that exist in the app', () => {
    for (const yol of yollar) expect(sayfaDosyasi(yol, appKok), yol).not.toBeNull();
    expect(sayfaDosyasi('/problem', appKok)).toBeNull();
    expect(sayfaDosyasi('/en', appKok)).toBeNull();
    expect(sayfaDosyasi('/legal/notice', appKok)).toBeNull();
  });

  it('lists no account, payment, admin or draft-only legal page', () => {
    for (const yol of yollar) {
      expect(yol).not.toMatch(/^\/(hesap|giris|kayit|odeme|yonetim|api|bakim)(\/|$)/);
    }
    // Draft texts without a published Casuist version are not served in production, so not listed.
    for (const taslak of ['aydinlatma', 'kosullar', 'iade-ve-kredi', 'topluluk', 'kaldirma', 'basvuru']) {
      expect(yollar, taslak).not.toContain(`/hukuki/${taslak}`);
    }
    expect(yollar).toContain('/hukuki');
    for (const yayinda of ['uyari', 'gizlilik', 'cerezler', 'yapay-zeka', 'erisilebilirlik']) {
      expect(yollar, yayinda).toContain(`/hukuki/${yayinda}`);
    }
  });

  it('never invents a modification date', () => {
    for (const e of harita) {
      if (e.lastModified !== undefined) expect(Number.isNaN(new Date(e.lastModified).getTime())).toBe(false);
    }
    expect(harita.find((e) => e.url === 'https://kazuist.com/ara')?.lastModified).toBeUndefined();
  });

  it('builds the same list for another origin', () => {
    const baska = siteHaritasi({ APP_URL: 'https://staging.kazuist.com' });
    expect(baska.map((e) => new URL(e.url).pathname)).toEqual(yollar);
    expect(baska.every((e) => e.url.startsWith('https://staging.kazuist.com'))).toBe(true);
  });
});

describe('llms.txt', () => {
  const metin = dosya('../public/llms.txt');
  const baglantilar = [...metin.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => new URL(m[1] ?? ''));

  it('is Turkish only, with no em dash and no English address', () => {
    expect(metin).not.toContain(String.fromCharCode(0x2014));
    expect(metin.startsWith('# Kazuist')).toBe(true);
    for (const yol of kaldirilanIngilizceYollar) {
      expect(baglantilar.map((u) => u.pathname)).not.toContain(yol);
    }
    expect(baglantilar.some((u) => u.pathname.startsWith('/legal'))).toBe(false);
  });

  it('links only production pages that exist in the app', () => {
    expect(baglantilar.length).toBeGreaterThan(5);
    for (const u of baglantilar) {
      expect(u.origin).toBe('https://kazuist.com');
      expect(sayfaDosyasi(u.pathname, appKok), u.pathname).not.toBeNull();
    }
  });

  it('names the same bots as robots.txt', () => {
    for (const bot of [...aramaBotlari, ...egitimBotlari]) expect(metin).toContain(bot);
  });
});
