import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ortak } from '@kazuist/i18n';
import manifest from '../../manifest.ts';
import {
  amacSatirlari,
  kartAlt,
  kartBoyutu,
  kenarNotlari,
  manifestSimgeleri,
  markaBelirtecleri,
  markaRenkleri,
} from './marka.ts';

const yol = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const tokens = readFileSync(yol('../../packages/ui/src/tokens.css'), 'utf8');
const simge = readFileSync(yol('src/app/icon.svg'), 'utf8');

/** Width and height from the IHDR chunk of a PNG buffer. */
function pngBoyutu(b: Buffer): [number, number] {
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('brand colours', () => {
  it.each(Object.entries(markaBelirtecleri))('%s equals its token %s', (ad, belirtec) => {
    const m = tokens.match(new RegExp(`${belirtec}:\\s*(#[0-9a-f]{6})`, 'i'));
    expect(m?.[1]?.toLowerCase()).toBe(markaRenkleri[ad as keyof typeof markaRenkleri]);
  });
});

describe('app/icon.svg, the hand drawn mark (ADR-0034 option B)', () => {
  it('is a square vector drawing with no text, raster image or script', () => {
    expect(simge).toMatch(/viewBox="0 0 32 32"/);
    expect(simge).not.toMatch(/<(text|image|script|foreignObject)\b/i);
    expect(simge).not.toMatch(/data:|href=/i);
    expect(statSync(yol('src/app/icon.svg')).size).toBeLessThan(2048);
  });
  it('uses only brand colours', () => {
    const renkler = new Set(Object.values(markaRenkleri) as string[]);
    const kullanilan = [...simge.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());
    expect(kullanilan.length).toBeGreaterThan(0);
    for (const r of kullanilan) expect(renkler, r).toContain(r);
  });
});

describe('raster icons written by docs/tasarim/simge-uret.mjs', () => {
  it('favicon.ico holds 16, 32 and 48 px PNG entries', () => {
    const ico = readFileSync(yol('src/app/favicon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    const sayi = ico.readUInt16LE(4);
    const boyutlar = Array.from({ length: sayi }, (_, i) => {
      const o = 6 + 16 * i;
      const veri = ico.subarray(ico.readUInt32LE(o + 12), ico.readUInt32LE(o + 12) + ico.readUInt32LE(o + 8));
      const [w, h] = pngBoyutu(veri);
      expect(ico.readUInt8(o)).toBe(w);
      // Colour type 6 (8 bit RGBA): ICO decoders reject palette entries.
      expect(veri.readUInt8(25)).toBe(6);
      return [w, h];
    });
    expect(boyutlar).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
    ]);
    expect(ico.length).toBeLessThan(15_000);
  });
  it.each([
    ['src/app/apple-icon.png', 180],
    ['public/icon-192.png', 192],
    ['public/icon-512.png', 512],
    ['public/icon-maskable-512.png', 512],
  ])('%s is %i px and small', (dosya, boyut) => {
    const b = readFileSync(yol(dosya));
    expect(pngBoyutu(b)).toEqual([boyut, boyut]);
    expect(b.length).toBeLessThan(40_000);
  });
});

describe('web app manifest', () => {
  const m = manifest();
  it('uses the brand name, purpose sentence and paper colour', () => {
    expect(m.name).toBe(ortak().marka);
    expect(m.description).toBe(ortak().amac);
    expect(m.lang).toBe('tr');
    expect(m.background_color).toBe(markaRenkleri.kagit);
    expect(m.theme_color).toBe(markaRenkleri.kagit);
  });
  it('lists icons that exist with the stated size', () => {
    expect(m.icons).toEqual(manifestSimgeleri.map((s) => ({ ...s })));
    for (const s of manifestSimgeleri) {
      const dosya = yol(`public${s.src}`);
      expect(existsSync(dosya), s.src).toBe(true);
      const [w, h] = pngBoyutu(readFileSync(dosya));
      expect(`${w}x${h}`).toBe(s.sizes);
    }
    expect(m.icons?.some((s) => s.purpose === 'maskable')).toBe(true);
  });
});

describe('OpenGraph card', () => {
  it('is 1200 x 630', () => {
    expect(kartBoyutu).toEqual({ width: 1200, height: 630 });
  });
  it('has Turkish alternative text of at most 120 characters with the purpose sentence', () => {
    expect(kartAlt().length).toBeLessThanOrEqual(120);
    expect(kartAlt()).toContain(ortak().amac);
  });
  it('splits the purpose sentence into lines without changing it, one margin note per line', () => {
    const satirlar = amacSatirlari();
    expect(satirlar.join(' ')).toBe(ortak().amac);
    expect(satirlar).toHaveLength(3);
    expect(kenarNotlari()).toHaveLength(satirlar.length);
    for (const n of kenarNotlari()) expect(n.trim().length).toBeGreaterThan(0);
  });
  it.each([
    'SourceSerif4-Regular.ttf',
    'SourceSerif4-Semibold.ttf',
    'KzSans-Medium.ttf',
    'KzMono-Regular.ttf',
  ])('font %s is plain TrueType (Satori does not read WOFF2)', (ad) => {
    const b = readFileSync(yol(`src/app/(kabuk)/_marka/yazi/${ad}`));
    expect(b.readUInt32BE(0)).toBe(0x00010000);
  });
});
