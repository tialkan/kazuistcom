import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { hukukiMetin, hukukiMetinler, gosterimKipi } from '../../(kabuk)/_hukuki/yukle.ts';
import { hukukiBelgeler, moduller } from '../../(kabuk)/_kabuk/rotalar.ts';
import { casuistSayfalari, trSayfalari } from '../../(casuist)/_bilesen/veri.ts';

/** One sitemap entry; `lastModified` is set only when a real change date is known (wt.111). */
export type Adres = { yol: string; lastModified?: Date };

/**
 * Modules whose root page stays out of the sitemap: /kaydettiklerim is a signed-in, per user
 * page (noindex). Every other module root is listed, so the sitemap follows rotalar.ts.
 */
export const siteHaritasiDisiModuller: ReadonlySet<string> = new Set(['/kaydettiklerim']);

/**
 * Public sub pages of the modules in rotalar.ts (every module is open, ADR-0033). Personal or interactive pages (pratik/bugun, pratik/editor,
 * pratik/hmgs/deneme) are left out; data driven pages (journal profiles, decks) join the segmented
 * sitemaps of Dalga 2.
 */
const modulAltSayfalari: readonly { modul: string; yol: string }[] = [
  { modul: '/rehberler', yol: '/rehberler/makale' },
  { modul: '/rehberler', yol: '/rehberler/tez' },
  { modul: '/rehberler', yol: '/rehberler/zotero-endnote' },
  { modul: '/rehberler', yol: '/rehberler/kontrol-listesi' },
  { modul: '/rehberler', yol: '/rehberler/etik' },
  { modul: '/yazma', yol: '/yazma/sablon' },
  { modul: '/yazma', yol: '/kalemcik' },
  { modul: '/pratik', yol: '/pratik/hmgs' },
];

/** Public pages that are not module tabs: home, pricing, the /tespit tool (ADR-0031) and the legal index. */
const genelSayfalar = ['/', '/fiyatlar', '/tespit', '/hukuki'] as const;

/**
 * Legal texts as production serves them: a publishable text (status yayinda, no open marker) is
 * listed with its version date; a draft is never listed. Where no Kazuist text is publishable the
 * archived Casuist text keeps the page (ADR-0002) and the page is listed without a date.
 */
export function hukukiAdresler(): Adres[] {
  const icerik = hukukiMetinler('tr').filter((m) => m.fm.route.startsWith('/hukuki/'));
  const slugs = [...new Set<string>([...hukukiBelgeler, ...icerik.map((m) => m.fm.slug)])].sort();
  const sonuc: Adres[] = [];
  for (const slug of slugs) {
    const metin = hukukiMetin('tr', slug);
    if (metin && gosterimKipi(metin, 'production') === 'yayin') {
      sonuc.push({ yol: `/hukuki/${slug}`, lastModified: new Date(`${metin.fm.date}T00:00:00Z`) });
    } else if (`hukuki/${slug}` in casuistSayfalari) {
      sonuc.push({ yol: `/hukuki/${slug}` });
    }
  }
  return sonuc;
}

/**
 * Every indexable public page, in a stable order. English addresses never appear (ADR-0032), nor
 * /eski (noindex, Ek H row 23), the 301 sources /tr/hukuki/* (Ek H rows 18-22) or account pages.
 */
export function siteHaritasiAdresleri(): Adres[] {
  const modulKokleri = moduller
    .map((m) => m.href)
    .filter((h) => !siteHaritasiDisiModuller.has(h))
    .sort();
  const modulAlt = modulAltSayfalari.map((s) => s.yol);
  const casuist = ['/tr', ...trSayfalari.map((s) => `/tr/${s}`)];
  const yollar = [...genelSayfalar, ...modulKokleri, ...modulAlt, ...casuist].map((yol): Adres => ({ yol }));
  // The legal documents follow their index page.
  const hukukiIndeks = yollar.findIndex((a) => a.yol === '/hukuki');
  yollar.splice(hukukiIndeks + 1, 0, ...hukukiAdresler());
  return yollar;
}

/** Page file for a URL path, following route groups and dynamic segments; null when the route does not exist. */
export function sayfaDosyasi(yol: string, kok: string): string | null {
  const parcalar = yol.split('/').filter(Boolean);
  const grupMu = (ad: string) => /^\(.+\)$/.test(ad);
  const ara = (dizin: string, i: number): string | null => {
    const girdiler = readdirSync(dizin, { withFileTypes: true }).filter((d) => d.isDirectory());
    if (i === parcalar.length) {
      const dosya = join(dizin, 'page.tsx');
      if (existsSync(dosya)) return dosya;
    } else {
      const tam = girdiler.find((d) => d.name === parcalar[i]);
      const bulunan = tam ? ara(join(dizin, tam.name), i + 1) : null;
      if (bulunan) return bulunan;
      for (const d of girdiler.filter((x) => /^\[[^\]]+\]$/.test(x.name))) {
        const dinamik = ara(join(dizin, d.name), i + 1);
        if (dinamik) return dinamik;
      }
    }
    for (const g of girdiler.filter((x) => grupMu(x.name))) {
      const icerde = ara(join(dizin, g.name), i);
      if (icerde) return icerde;
    }
    return null;
  };
  return ara(kok, 0);
}
