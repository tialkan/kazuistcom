import { expect, it } from 'vitest';
import { createConsumer, type SqlClient } from '../src/queue.ts';

const valid = { type: 'odeme', userId: '00000000-0000-4000-8000-000000000001' };

/** Fake client: one claimed job, then the answer of every UPDATE comes from `owner` (who holds the lock). */
function fake(payload: unknown, owner = 'w') {
  const calls: { word: string; sql: string; params: unknown[] }[] = [];
  const db: SqlClient = {
    async query<R>(sql: string, params: unknown[] = []) {
      calls.push({ word: sql.trim().split(/\s+/)[0] ?? '', sql, params });
      if (sql.includes('SKIP LOCKED'))
        return { rows: [{ id: 'j1', type: 'notify.send', payload, attempts: 1, max_attempts: 5 }] as R[] };
      const worker = params.at(-1);
      return { rows: (worker === owner ? [{ id: 'j1' }] : []) as R[] };
    },
  };
  return { db, calls };
}

it('claims, runs and completes jobs through the SQL contract, matching the worker id', async () => {
  const { db, calls } = fake(valid);
  const seen: unknown[] = [];
  const consumer = createConsumer(
    db,
    'w',
    {
      'notify.send': async (job) => {
        seen.push(job.payload);
        return { ok: true };
      },
    },
    { log: () => {} },
  );
  expect(consumer.channels()).toEqual(['jobs_notify_send']);
  expect(await consumer.runOnce('notify.send')).toBe(1);
  expect(calls.map((c) => c.word)).toEqual(['WITH', 'UPDATE']);
  expect(calls[1]?.sql).toContain("status = 'done'");
  expect(calls[1]?.params).toEqual(['j1', '{"ok":true}', 'w']);
  expect(seen).toEqual([valid]);
});

it('buries a job whose payload fails the contract without running or logging it', async () => {
  const { db, calls } = fake({ type: 'odeme', userId: 'Ahmet Yilmaz' });
  const logs: unknown[] = [];
  let ran = false;
  const consumer = createConsumer(
    db,
    'w',
    {
      'notify.send': async () => {
        ran = true;
      },
    },
    { log: (m, extra) => logs.push([m, extra]) },
  );
  await consumer.runOnce('notify.send');
  expect(ran).toBe(false);
  expect(calls[1]?.sql).toContain("status = 'dead'");
  expect(calls[1]?.params).toEqual(['j1', 'invalid payload', 'w']);
  expect(JSON.stringify(logs)).not.toContain('Ahmet');
  expect(logs).toEqual([['job buried', { jobId: 'j1', type: 'notify.send', reason: 'invalid_payload' }]]);
});

it('fails with the error class only and reports a lost lock instead of finishing', async () => {
  const { db, calls } = fake(valid, 'someone-else');
  const logs: unknown[] = [];
  const consumer = createConsumer(
    db,
    'w',
    {
      'notify.send': async () => {
        throw new TypeError('secret text');
      },
    },
    { log: (m, extra) => logs.push([m, extra]) },
  );
  await consumer.runOnce('notify.send');
  expect(calls[1]?.params).toEqual(['j1', 'TypeError', 'w']);
  expect(logs).toEqual([['lock lost', { jobId: 'j1', type: 'notify.send', step: 'fail' }]]);
});

it('renews the lock while the handler runs and stops after it', async () => {
  const { db, calls } = fake(valid);
  const consumer = createConsumer(
    db,
    'w',
    {
      'notify.send': async () => {
        await new Promise((r) => setTimeout(r, 70));
        return null;
      },
    },
    { heartbeatMs: 20, log: () => {} },
  );
  await consumer.runOnce('notify.send');
  const beats = calls.filter((c) => c.sql.includes('locked_at = now()') && !c.sql.includes('SKIP LOCKED'));
  expect(beats.length).toBeGreaterThanOrEqual(2);
  expect(beats[0]?.params).toEqual(['j1', 'w']);
  const after = calls.length;
  await new Promise((r) => setTimeout(r, 60));
  expect(calls.length).toBe(after);
});
