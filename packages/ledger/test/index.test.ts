import { expect, it } from 'vitest';
import { isBalanced } from '../src/index.ts';

it('accepts balanced and rejects unbalanced transactions', () => {
  expect(
    isBalanced([
      { accountId: 'a', side: 'borc', credits: 5 },
      { accountId: 'b', side: 'alacak', credits: 5 },
    ]),
  ).toBe(true);
  expect(isBalanced([{ accountId: 'a', side: 'borc', credits: 5 }])).toBe(false);
  expect(
    isBalanced([
      { accountId: 'a', side: 'borc', credits: 5 },
      { accountId: 'b', side: 'alacak', credits: 4 },
    ]),
  ).toBe(false);
});
