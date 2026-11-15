import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sayfaDosyasi } from '../src/app/(seo)/_seo/adresler.ts';

/**
 * Internal link check (2026-11-15): every literal in-app address written in the web app, the worker notices and
 * the dictionaries must have a page. Found and fixed with this test: /hesap/cuzdan (billing notices, no wallet
 * page). API paths, static files and fragments are out of scope.
 */
const kok = fileURLToPath(new URL('../../../', import.meta.url));
const appKok = join(kok, 'apps/web/src/app');
const publicKok = join(kok, 'apps/web/public');

function dosyalar(dizin: string): string[] {
  return readdirSync(dizin).flatMap((ad) => {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) return ad === 'node_modules' || ad === '_kanit' ? [] : dosyalar(yol);
    return /\.(tsx?|json)$/.test(ad) && !/\.test\.tsx?$/.test(ad) && !yol.includes('__tests__') ? [yol] : [];
  });
}

const kaynaklar = [
  ...dosyalar(join(kok, 'apps/web/src')),
  ...dosyalar(join(kok, 'apps/worker-node/src')),
  ...dosyalar(join(kok, 'packages/i18n/tr')),
];

/** href="/x", href: '/x', path: '/x', Dugme href and markdown links ](/x) with a literal address. */
const desen = /(?:href=["'{`]+|href:\s*['"`]|path:\s*['"`]|\]\()(\/[a-z0-9][a-z0-9\-/]*)/g;

function adresler(): Map<string, string> {
  const bulunan = new Map<string, string>();
  for (const dosya of kaynaklar) {
    const metin = readFileSync(dosya, 'utf8');
    for (const m of metin.matchAll(desen)) {
      // A template literal continues with ${...}: the address is dynamic and out of scope.
      if (metin[(m.index ?? 0) + m[0].length] === '$') continue;
      const yol = (m[1] ?? '').replace(/\/$/, '') || '/';
      if (yol.startsWith('/api/') || yol === '/api') continue;
      if (existsSync(join(publicKok, yol))) continue;
      if (!bulunan.has(yol)) bulunan.set(yol, dosya.slice(kok.length));
    }
  }
  return bulunan;
}

describe('internal links', () => {
  const liste = adresler();

  it('finds the addresses it is meant to check', () => {
    expect(liste.size).toBeGreaterThan(20);
    expect(liste.has('/hesap')).toBe(true);
    expect(liste.has('/tespit')).toBe(true);
  });

  it('points every literal internal address at an existing page', () => {
    const kirik = [...liste].filter(([yol]) => sayfaDosyasi(yol, appKok) === null);
    expect(kirik.map(([yol, dosya]) => `${yol} (${dosya})`)).toEqual([]);
  });
});
