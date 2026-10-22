import { expect, it } from 'vitest';
import { billingHandlers, reconcileDayOf } from '../src/billing/jobs.ts';
import { createConsumer, type SqlClient } from '../src/queue.ts';

const now = new Date('2026-10-20T03:00:00Z');

it('picks the payload day or yesterday for reconciliation', () => {
  expect(reconcileDayOf({ day: '2026-10-01' }, now).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  expect(reconcileDayOf({}, now).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  expect(reconcileDayOf({ day: 'x' }, now).toISOString()).toBe('2026-10-19T00:00:00.000Z');
});

it('runs billing.reconcile and billing.monthly_grant through the job consumer', async () => {
  const results: unknown[] = [];
  const db: SqlClient = {
    async query<R>(sql: string, params?: unknown[]) {
      if (sql.includes('SKIP LOCKED'))
        return {
          rows: [
            { id: 'j', type: params?.[0], payload: { day: '2026-10-19' }, attempts: 1, max_attempts: 5 },
          ] as R[],
        };
      if (sql.includes("status = 'done'")) results.push(JSON.parse(String(params?.[1])));
      return { rows: [] as R[] };
    },
  };
  const handlers = billingHandlers({
    now: () => now,
    monthlyGrant: async () => 2,
    reconcileDay: async () => ({
      disabled: false,
      diffs: [
        { paymentId: 'p1', kind: 'odeme', problem: 'kayitta_yok', providerKurus: 100, recordedKurus: null },
      ],
    }),
  });
  const c = createConsumer(db, 'w', handlers);
  await c.runOnce('billing.reconcile');
  await c.runOnce('billing.monthly_grant');
  expect(results).toEqual([
    { day: '2026-10-19', disabled: false, differences: 1, paymentIds: ['p1'] },
    { granted: 2 },
  ]);
});
