import { describe, expect, it } from 'vitest';
import { HttpIyzico } from '../../src/billing/iyzico.ts';

const cfg = { apiKey: 'test', secretKey: 'test', baseUrl: 'https://sandbox-api.iyzipay.com' };
function api(transactions: Record<string, unknown>[]) {
  return new HttpIyzico(cfg, (async () =>
    Response.json({ status: 'success', transactions, totalPageCount: 1 })) as typeof fetch);
}
const row = {
  paymentId: 700,
  paymentTxId: 800,
  transactionId: 800,
  transactionDate: '2026-10-25 16:58:38',
  transactionCurrency: 'TRY',
  conversationId: 'order-test',
  price: 39,
  paidPrice: 39,
};

describe('daily report identifiers and partial refunds (real sandbox response shape, 2026-10-26)', () => {
  it('links item transaction rows to the original payment and uses the refunded amount', async () => {
    const report = await api([
      { ...row, transactionType: 'PAYMENT' },
      { ...row, transactionType: 'REFUND', transactionId: 901, price: 10 },
      { ...row, transactionType: 'REFUND', transactionId: 902, price: 10 },
    ]).listTransactions('2026-10-25');
    expect(report.map(({ paymentId, kind, amountKurus }) => ({ paymentId, kind, amountKurus }))).toEqual([
      { paymentId: '700', kind: 'odeme', amountKurus: 3900 },
      { paymentId: '700', kind: 'iade', amountKurus: 1000 },
      { paymentId: '700', kind: 'iade', amountKurus: 1000 },
    ]);
    expect(report[0]?.at.toISOString()).toBe('2026-10-25T13:58:38.000Z');
  });
  it('rejects report lines without the original payment identity or a valid TRY amount', async () => {
    for (const invalid of [
      { paymentId: undefined },
      { price: undefined, paidPrice: undefined },
      { transactionCurrency: 'USD' },
    ]) {
      await expect(
        api([{ ...row, ...invalid, transactionType: 'PAYMENT' }]).listTransactions('2026-10-25'),
      ).rejects.toThrow();
    }
  });
});

describe('complete daily report envelopes', () => {
  it('rejects unavailable transaction arrays and invalid or excessive page counts', async () => {
    for (const payload of [
      { status: 'success' },
      { status: 'success', transactions: null, totalPageCount: 1 },
      ...[undefined, 0, -1, 1.5, 101, '1'].map((totalPageCount) => ({
        status: 'success',
        transactions: [],
        totalPageCount,
      })),
    ]) {
      const client = new HttpIyzico(cfg, (async () => Response.json(payload)) as typeof fetch);
      await expect(client.listTransactions('2026-10-25')).rejects.toThrow();
    }
  });
  it('reads every page and rejects changing pagination metadata', async () => {
    let calls = 0;
    const client = new HttpIyzico(cfg, (async () =>
      Response.json({
        status: 'success',
        transactions: [{ ...row, transactionType: 'PAYMENT' }],
        totalPageCount: 2,
        currentPage: ++calls,
      })) as typeof fetch);
    expect(await client.listTransactions('2026-10-25')).toHaveLength(2);
    expect(calls).toBe(2);
    calls = 0;
    const changing = new HttpIyzico(cfg, (async () =>
      Response.json({
        status: 'success',
        transactions: [],
        totalPageCount: ++calls === 1 ? 2 : 1,
      })) as typeof fetch);
    await expect(changing.listTransactions('2026-10-25')).rejects.toThrow();
  });
});
