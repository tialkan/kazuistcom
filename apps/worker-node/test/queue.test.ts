import { expect, it } from 'vitest';
import { createConsumer, type SqlClient } from '../src/queue.ts';

it('claims, runs and completes jobs through the SQL contract', async () => {
  const calls: string[] = [];
  const db: SqlClient = {
    async query<R>(sql: string) {
      calls.push(sql.trim().split(/\s+/)[0] ?? '');
      if (sql.includes('SKIP LOCKED'))
        return {
          rows: [{ id: 'j1', type: 'notify.send', payload: {}, attempts: 1, max_attempts: 5 }] as R[],
        };
      return { rows: [] as R[] };
    },
  };
  const consumer = createConsumer(db, 'w', { 'notify.send': async () => ({ ok: true }) });
  expect(consumer.channels()).toEqual(['jobs_notify_send']);
  expect(await consumer.runOnce('notify.send')).toBe(1);
  expect(calls).toEqual(['WITH', 'UPDATE']);
});
