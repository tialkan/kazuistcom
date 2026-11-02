import { expect, it } from 'vitest';
import { loadWallet, type SqlClient } from '../src/pg.ts';
import { ACCOUNTS } from '../src/engine.ts';

it('preserves historical reservation allocations, order and duplicate rows without repeated history scans', async () => {
  const walletId = 'allocation-fixture';
  const entries = Array.from({ length: 1800 }, (_, n) => ({
    tx_id: `tx-${n}`,
    key: `rezervasyon:op-${n % 100}`,
    kind: 'rezervasyon',
    code: n % 4 === 0 ? ACCOUNTS.reserve(walletId) : ACCOUNTS.wallet(walletId),
    side: 'borc',
    credits: (n % 9) + 1,
    lot_id: n % 7 === 0 ? null : `lot-${n % 15}`,
    rev: null,
  }));
  const reservations = Array.from({ length: 101 }, (_, n) => ({
    operation_id: `op-${n}`,
    estimated_credits: 100,
    actual_credits: null,
    status: n % 2 === 0 ? 'acik' : 'tuketildi',
    expires_at: new Date('2026-10-28T00:00:00Z'),
  }));
  let queries = 0;
  const db = {
    query: async (sql: string) => {
      queries++;
      return {
        rows: sql.includes('from ledger_entries')
          ? entries
          : sql.includes('from reservations')
            ? reservations
            : [],
      };
    },
  } as SqlClient;
  const result = await loadWallet(db, walletId);
  for (const reservation of result.state.reservations) {
    const historical = entries
      .filter(
        (e) =>
          e.key === `rezervasyon:${reservation.operationId}` &&
          e.code === ACCOUNTS.wallet(walletId) &&
          e.lot_id,
      )
      .map((e) => ({ lotId: e.lot_id, credits: e.credits }));
    expect(reservation.allocations).toEqual(historical);
  }
  expect(result.state.reservations[100]?.allocations).toEqual([]);
  expect(queries).toBe(3);
});
