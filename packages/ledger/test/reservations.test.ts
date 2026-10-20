import { expect, it } from 'vitest';
import { Ledger, LedgerReservationsAdapter, memoryRunner } from '../src/index.ts';

it('implements the ai-gateway LedgerReservations contract', async () => {
  const l = new Ledger();
  const now = new Date('2026-10-20T10:00:00Z');
  l.grant({ key: 'g', walletId: 'w-u1', source: 'paket', credits: 100, originRef: 'g', now });
  const a = new LedgerReservationsAdapter(
    memoryRunner(l),
    (u) => `w-${u}`,
    () => now,
  );
  const r1 = await a.reserve({ userId: 'u1', credits: 60, idempotencyKey: 'req-1' });
  expect(await a.reserve({ userId: 'u1', credits: 60, idempotencyKey: 'req-1' })).toEqual(r1);
  await a.consume(r1.reservationId, 2);
  const r2 = await a.reserve({ userId: 'u1', credits: 60, idempotencyKey: 'req-2' });
  await a.consume(r2.reservationId, 0);
  const r3 = await a.reserve({ userId: 'u1', credits: 60, idempotencyKey: 'req-3' });
  await a.release(r3.reservationId);
  expect(l.balance('w-u1')).toBe(98);
  await expect(a.reserve({ userId: 'u1', credits: 99, idempotencyKey: 'req-4' })).rejects.toThrow(
    'insufficient_credits',
  );
});
