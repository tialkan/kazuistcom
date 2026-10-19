import { expect, it } from 'vitest';
import { MAX_SENTENCES, MAX_WORDS, MIN_QUOTE_CHARS, parseModelLine } from '../src/index.ts';

it('exposes Ek D limits and the model line parser', () => {
  expect([MAX_SENTENCES, MAX_WORDS, MIN_QUOTE_CHARS]).toEqual([3, 70, 12]);
  expect(parseModelLine('{"t":"son"}')).toEqual({ t: 'son' });
});
