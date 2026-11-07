import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { flattenKeys, ortak, upperTr, type OrtakSozluk } from '../src/index.ts';

const kok = fileURLToPath(new URL('../', import.meta.url));
const dir = fileURLToPath(new URL('../tr/', import.meta.url));
const trFiles = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const load = (f: string) => JSON.parse(readFileSync(dir + f, 'utf8')) as Record<string, unknown>;

describe('i18n key structure (Turkish only, ADR-0032)', () => {
  it('ships only the tr dictionary directory', () => {
    expect(readdirSync(kok).filter((d) => /^[a-z]{2}$/.test(d))).toEqual(['tr']);
    expect(trFiles).toContain('ortak.json');
  });

  it.each(trFiles)('%s has string leaves, well formed unique keys and no empty values', (f) => {
    const sozluk = load(f);
    const anahtarlar = flattenKeys(sozluk as Parameters<typeof flattenKeys>[0]);
    expect(anahtarlar.length).toBeGreaterThan(0);
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length);
    const gez = (d: unknown, yol: string): void => {
      if (typeof d === 'string') {
        expect(d.trim().length, `${f}: ${yol} is empty`).toBeGreaterThan(0);
        return;
      }
      expect(
        d !== null && typeof d === 'object' && !Array.isArray(d),
        `${f}: ${yol} is not a dictionary`,
      ).toBe(true);
      for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
        expect(k, `${f}: key ${yol}${k}`).toMatch(/^\S+$/);
        gez(v, `${yol}${k}.`);
      }
    };
    gez(sozluk, '');
  });

  it('types ortak() from the Turkish source and takes no locale', () => {
    expectTypeOf(ortak()).toEqualTypeOf<OrtakSozluk>();
    expectTypeOf(ortak).parameters.toEqualTypeOf<[]>();
    expect(ortak()).toBe(ortak());
  });
});

it('upper cases with Turkish rules', () => {
  expect(upperTr('istanbul ılık')).toBe('İSTANBUL ILIK');
});
