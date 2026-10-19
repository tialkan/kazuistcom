import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flattenKeys, upperTr } from '../src/index.ts';

const dir = (l: string) => fileURLToPath(new URL(`../${l}/`, import.meta.url));
const load = (l: string, f: string) => JSON.parse(readFileSync(dir(l) + f, 'utf8'));

describe('i18n key parity (tr is the source)', () => {
  const trFiles = readdirSync(dir('tr'))
    .filter((f) => f.endsWith('.json'))
    .sort();
  it('en has the same module files as tr', () => {
    expect(
      readdirSync(dir('en'))
        .filter((f) => f.endsWith('.json'))
        .sort(),
    ).toEqual(trFiles);
  });
  it.each(trFiles)('%s has identical keys and no empty values', (f) => {
    const tr = load('tr', f);
    const en = load('en', f);
    expect(flattenKeys(en).sort()).toEqual(flattenKeys(tr).sort());
    for (const v of JSON.stringify([tr, en]).match(/"[^"]*"/g) ?? []) expect(v).not.toBe('""');
  });
});

it('upper cases with Turkish rules', () => {
  expect(upperTr('istanbul ılık')).toBe('İSTANBUL ILIK');
});
