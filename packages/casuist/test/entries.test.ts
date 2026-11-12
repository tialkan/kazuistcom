import { expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import * as root from '../src/index.ts';
import * as testing from '../src/testing.ts';

it('seedCorpus is reachable only from the test entry, never from the package root (review.md P9/8)', () => {
  expect('seedCorpus' in root).toBe(false);
  expect(typeof testing.seedCorpus).toBe('function');
  expect(pkg.exports['./testing']).toBe('./src/testing.ts');
  expect(Object.keys(testing)).toEqual(['seedCorpus']);
});
