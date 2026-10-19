import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { tokenNames } from '../src/index.ts';

it('tokens.css declares exactly the exported token names', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/tokens.css', import.meta.url)), 'utf8');
  const root = css.slice(css.indexOf(':root'), css.indexOf('}'));
  const declared = [...root.matchAll(/(--kz-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  expect(declared).toEqual([...tokenNames]);
});
