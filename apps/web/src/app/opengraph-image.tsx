import { ImageResponse } from 'next/og';
import { kartAlt, kartBoyutu } from './(kabuk)/_marka/marka.ts';
import { kartGovdesi, kartYazilari, simgeVerisi } from './(kabuk)/_marka/paylasimKarti.tsx';

// Default share card for every page (plan 12/14, wt.25, wt.116; docs/istekler/seo-p6-og-gorseli.md).
// Typography only, no generated imagery (ADR-0034 option B). Rendered once at build time.
export const alt = kartAlt();
export const size = kartBoyutu;
export const contentType = 'image/png';
export const dynamic = 'force-static';

export default async function Image() {
  const [yazilar, simge] = await Promise.all([kartYazilari(), simgeVerisi()]);
  return new ImageResponse(kartGovdesi(simge), { ...kartBoyutu, fonts: yazilar });
}
