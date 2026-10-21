import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ortak } from '@kazuist/i18n';
import type { Dugum } from './Dugum.tsx';
import { casuistGorselleri, gorselOzellikleri } from './gorseller.ts';

const burasi = fileURLToPath(new URL('.', import.meta.url));
const icerik = join(burasi, '../_icerik');
const genel = join(burasi, '../../../../public/casuist');

function resimler(d: Dugum, out: Record<string, string>[] = []): Record<string, string>[] {
  if (typeof d === 'string') return out;
  const [etiket, oz, ...cocuklar] = d;
  if (etiket === 'img') out.push(oz);
  for (const c of cocuklar) resimler(c, out);
  return out;
}

function al(src: string) {
  const g = casuistGorselleri[src];
  if (!g) throw new Error(`no local copy for ${src}`);
  return g;
}

const tumResimler = readdirSync(icerik).flatMap((f) => {
  const sayfa = JSON.parse(readFileSync(join(icerik, f), 'utf8')) as { main: Dugum[] };
  return sayfa.main.flatMap((d) => resimler(d)).map((oz) => ({ sayfa: f, oz }));
});

describe('Casuist images', () => {
  it('every archived image has a local copy', () => {
    // index and tr: header image; partner and tr_ortak: three marks each; eski: four university logos.
    expect(tumResimler.length).toBe(12);
    for (const { sayfa, oz } of tumResimler) {
      expect(casuistGorselleri[oz.src ?? ''], `${sayfa} ${oz.src}`).toBeDefined();
    }
  });

  it('every listed AVIF, WebP and SVG file exists and is not empty', () => {
    for (const g of Object.values(casuistGorselleri)) {
      const dosyalar = g.svg
        ? [`${g.ad}.svg`]
        : g.genislikler.flatMap((w) => [`${g.ad}-${w}.avif`, `${g.ad}-${w}.webp`]);
      for (const d of dosyalar) {
        const p = join(genel, d);
        expect(existsSync(p), d).toBe(true);
        expect(statSync(p).size, d).toBeGreaterThan(0);
      }
    }
  });

  it('every image has an alt text, and the header image a translated one', () => {
    for (const dil of ['tr', 'en'] as const) {
      const alt = ortak(dil).casuist.gorselAlt;
      for (const { oz } of tumResimler) {
        const g = al(oz.src ?? '');
        const metin = g.altAnahtari ? alt[g.altAnahtari] : oz.alt;
        expect(metin?.trim().length, oz.src).toBeGreaterThan(0);
      }
    }
  });

  it('logos keep the archived height and their own aspect ratio', () => {
    const eureka = gorselOzellikleri(al('/eureka.png'), 40);
    expect([eureka.width, eureka.height]).toEqual([152, 40]);
    const hacettepe = gorselOzellikleri(al('/hacettepe-logo.png'), 32);
    expect([hacettepe.width, hacettepe.height]).toEqual([22, 32]);
    expect(hacettepe.avifSrcSet).toContain('/casuist/hacettepe-44.avif 44w');
    const tubitak = gorselOzellikleri(al('/tubitak.svg'), 58);
    expect(tubitak).toMatchObject({ svg: true, src: '/casuist/tubitak.svg', width: 47, height: 58 });
  });

  it('the header image stays fluid with its intrinsic size', () => {
    const b = gorselOzellikleri(al('/kazuist-baslik.webp'), 900);
    expect([b.width, b.height]).toEqual([1600, 900]);
    expect(b.sizes).toContain('100vw');
    expect(b.webpSrcSet).toContain('/casuist/kazuist-baslik-640.webp 640w');
  });
});
