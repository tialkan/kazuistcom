import { ortak } from '@kazuist/i18n';

/**
 * Brand colours for files that cannot read CSS custom properties: the web app manifest, the
 * OpenGraph card (next/og) and the icon generator. Every value equals a token in
 * packages/ui/src/tokens.css; marka.test.ts fails when they drift apart.
 */
export const markaRenkleri = {
  kagit: '#fbf8f1', // --kz-color-bg
  murekkep: '#1c1b19', // --kz-color-text
  soluk: '#57524a', // --kz-color-text-muted
  cizgi: '#d6cfbf', // --kz-color-border
  lal: '#a1351f', // --kz-color-accent
} as const;

/** Token name for each brand colour, used by the drift test. */
export const markaBelirtecleri: Record<keyof typeof markaRenkleri, string> = {
  kagit: '--kz-color-bg',
  murekkep: '--kz-color-text',
  soluk: '--kz-color-text-muted',
  cizgi: '--kz-color-border',
  lal: '--kz-color-accent',
};

/** Manifest icon files in apps/web/public, written by docs/tasarim/simge-uret.mjs from app/icon.svg. */
export const manifestSimgeleri = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const;

/** OpenGraph card size (plan 12/14, wt.25): the common 1.91:1 large preview. */
export const kartBoyutu = { width: 1200, height: 630 } as const;

/** Alternative text of the card: what it shows, in Turkish (wt.116), at most 120 characters. */
export function kartAlt(): string {
  const o = ortak();
  return `${o.paylasim.kartAlt}: ${o.amac}`;
}

/**
 * The purpose sentence split after each comma, so each clause sits on its own line with its margin
 * note. Joining the parts with a space gives the sentence back unchanged (tested).
 */
export function amacSatirlari(amac: string = ortak().amac): string[] {
  return amac.split(/(?<=,)\s+/);
}

/** One margin note per clause: the product area that does what the clause says. */
export function kenarNotlari(): string[] {
  const s = ortak().gezinme.sekme;
  return [s.ara, s.atifAgi, s.yazma];
}
