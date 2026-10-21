import { expect, it } from 'vitest';
import { canPay } from '../../../app/(odeme)/odeme/gate.ts';

it('opens payment only after the confirmation and the withdrawal exception boxes', () => {
  expect(canPay({ kind: 'paket', confirmed: false, withdrawalWaiver: true })).toBe(false);
  expect(canPay({ kind: 'paket', confirmed: true, withdrawalWaiver: false })).toBe(false);
  expect(canPay({ kind: 'paket', confirmed: true, withdrawalWaiver: true })).toBe(true);
  expect(canPay({ kind: 'abonelik', confirmed: true, withdrawalWaiver: false })).toBe(false);
  expect(canPay({ kind: 'abonelik', confirmed: true, withdrawalWaiver: true })).toBe(true);
});
