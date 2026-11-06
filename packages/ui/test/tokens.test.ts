import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, tokenNames } from '../src/index.ts';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (f: string) => readFileSync(join(srcDir, f), 'utf8');
const css = read('tokens.css');
const root = css.slice(css.indexOf(':root'), css.indexOf('}'));
const value = (name: string) => {
  const m = root.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m?.[1]) throw new Error(`missing ${name}`);
  return m[1].trim();
};

it('tokens.css declares exactly the exported token names', () => {
  const declared = [...root.matchAll(/(--kz-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  expect(declared).toEqual([...tokenNames]);
});

describe('colour contrast (WCAG 2.1 AA, wt.132)', () => {
  const bg = value('--kz-color-bg');
  const surface = value('--kz-color-surface');
  it.each([
    '--kz-color-text',
    '--kz-color-text-muted',
    '--kz-color-accent',
    '--kz-color-success',
    '--kz-color-warning',
    '--kz-color-danger',
    '--kz-color-authority-binding',
    '--kz-color-authority-high',
    '--kz-color-authority-precedent',
    '--kz-color-authority-other',
  ])('%s reaches 4.5:1 on paper and surface', (name) => {
    expect(contrastRatio(value(name), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(value(name), surface)).toBeGreaterThanOrEqual(4.5);
  });
  it('accent contrast colour reads on its fill', () => {
    expect(
      contrastRatio(value('--kz-color-accent-contrast'), value('--kz-color-accent')),
    ).toBeGreaterThanOrEqual(4.5);
  });
  it('inverted ink button reads', () => {
    expect(contrastRatio(bg, value('--kz-color-text'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('one accent colour (plan 12.2, ADR-0031)', () => {
  it('declares no second brand colour', () => {
    expect(root).not.toMatch(/--kz-color-kampus/);
    expect(read('components.css')).not.toMatch(/kampus/);
  });
});

describe('design bans (plan 12.6, wt.26-27)', () => {
  const all = ['tokens.css', 'components.css', 'fonts.css'].map(read).join('\n');
  it('uses no banned font family', () => {
    for (const f of ['Inter', 'Poppins', 'Space Grotesk', 'Manrope', 'DM Sans'])
      expect(all).not.toMatch(new RegExp(`['"\\s,]${f}['",;]`));
  });
  it('uses no glass effect', () => {
    expect(all).not.toContain('backdrop-filter');
  });
  it('declares font-display swap for every face', () => {
    const faces = read('fonts.css').match(/@font-face\s*{[^}]*}/g) ?? [];
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) expect(f).toContain('font-display: swap');
  });
});
