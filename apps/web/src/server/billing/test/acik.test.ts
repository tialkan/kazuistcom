import { describe, expect, it } from 'vitest';
import { odemeAcik } from '../acik.ts';

describe('payments-off launch mode switch (K-09)', () => {
  const all = { IYZICO_API_KEY: 'a', IYZICO_SECRET_KEY: 'b', IYZICO_MERCHANT_ID: 'c' };

  it('is open only with all three iyzico variables', () => {
    expect(odemeAcik(all)).toBe(true);
    expect(odemeAcik({})).toBe(false);
    for (const k of Object.keys(all)) expect(odemeAcik({ ...all, [k]: undefined }), k).toBe(false);
  });

  it('treats empty and blank values as missing, like getBillingService', () => {
    expect(odemeAcik({ ...all, IYZICO_API_KEY: '' })).toBe(false);
    expect(odemeAcik({ ...all, IYZICO_SECRET_KEY: '   ' })).toBe(false);
  });
});
