/**
 * Images of the protected Casuist pages, keyed by the original path on https://kazuist.com
 * (kept as `src` in the archived JSON). Files were downloaded read-only from the live site on
 * 2026-10-20 and converted by docs/tasarim/casuist-arsiv/gorselleri-donustur.mjs into
 * apps/web/public/casuist. Restored by Tarik's decision of 2026-10-20 (docs/kararlar.md): the header
 * image is not AI generated and the programme and university marks may be used (his statement).
 */
export type CasuistGorseli = {
  /** Base name under /casuist; raster files are `<ad>-<width>.avif` and `<ad>-<width>.webp`. */
  ad: string;
  /** Intrinsic aspect of the original file. */
  genislik: number;
  yukseklik: number;
  /** Widths generated in AVIF and WebP; empty for SVG. */
  genislikler: number[];
  svg?: boolean;
  /** ortak.json casuist.gorselAlt key when the alt text is a UI string rather than a proper name. */
  altAnahtari?: 'kazuistBaslik';
  /** `sizes` for responsive images; logos are sized from the archived height instead. */
  sizes?: string;
  oncelikli?: boolean;
};

export const casuistGorselleri: Record<string, CasuistGorseli> = {
  '/kazuist-baslik.webp': {
    ad: 'kazuist-baslik',
    genislik: 1600,
    yukseklik: 900,
    genislikler: [640, 960, 1280, 1600],
    altAnahtari: 'kazuistBaslik',
    // .kahraman is 3fr / 2fr from 60rem; the image sits in the narrower column of the 76rem body.
    sizes: '(min-width: 76rem) 29rem, (min-width: 60rem) 40vw, 100vw',
    oncelikli: true,
  },
  '/tubitak.svg': { ad: 'tubitak', genislik: 111.45, yukseklik: 136.25, genislikler: [], svg: true },
  '/eureka.png': { ad: 'eureka', genislik: 560, yukseklik: 147, genislikler: [150, 300] },
  '/eurostars.png': { ad: 'eurostars', genislik: 380, yukseklik: 283, genislikler: [78, 156] },
  '/hacettepe-logo.png': { ad: 'hacettepe', genislik: 1359, yukseklik: 2000, genislikler: [16, 22, 32, 44] },
  '/aybu-logo.png': { ad: 'aybu', genislik: 185, yukseklik: 272, genislikler: [16, 22, 32, 44] },
};

const yol = (ad: string, w: number, uzanti: 'avif' | 'webp') => `/casuist/${ad}-${w}.${uzanti}`;

export type GorselOzellikleri = {
  width: number;
  height: number;
  src: string;
  avifSrcSet?: string;
  webpSrcSet?: string;
  sizes?: string;
  svg: boolean;
};

/**
 * Display size and sources for one archived image. Logos keep the archived display height and take
 * the width from the original aspect ratio (the old site used h-8 w-auto and similar), so nothing is
 * stretched; the header image stays fluid.
 */
export function gorselOzellikleri(g: CasuistGorseli, arsivYuksekligi?: number): GorselOzellikleri {
  const oran = g.genislik / g.yukseklik;
  const logo = !g.sizes;
  const height = logo && arsivYuksekligi ? arsivYuksekligi : g.yukseklik;
  const width = logo && arsivYuksekligi ? Math.round(arsivYuksekligi * oran) : g.genislik;
  if (g.svg) return { width, height, src: `/casuist/${g.ad}.svg`, svg: true };
  const set = (u: 'avif' | 'webp') => g.genislikler.map((w) => `${yol(g.ad, w, u)} ${w}w`).join(', ');
  const enBuyuk = g.genislikler[g.genislikler.length - 1] ?? g.genislik;
  // Fallback src: smallest file that still covers a 2x screen.
  const yedek = g.genislikler.find((w) => w >= width * 2) ?? enBuyuk;
  return {
    width,
    height,
    src: yol(g.ad, yedek, 'webp'),
    avifSrcSet: set('avif'),
    webpSrcSet: set('webp'),
    sizes: g.sizes ?? `${width}px`,
    svg: false,
  };
}
