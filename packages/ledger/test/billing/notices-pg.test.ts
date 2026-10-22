/** Y5: due billing notices become notify.send jobs exactly once (worker-node billing/notices.ts on PGlite). */
import { expect, it } from 'vitest';
import { NotifyPayload } from '@kazuist/contracts';
import { noticeTick } from '../../../../apps/worker-node/src/billing/notices.ts';
import { pgBillingEnv } from './pg-env.ts';

it('dispatches due notices once, leaves future ones, payload matches the contract', async () => {
  const e = await pgBillingEnv();
  const now = new Date('2026-10-20T09:00:00Z');
  await e.store.addNotice({
    userId: e.userId,
    kind: 'odeme_7_gun',
    ref: 'sub:1',
    sendAt: new Date('2026-10-19T09:00:00Z'),
  });
  await e.store.addNotice({ userId: e.userId, kind: 'fesih_teyidi', ref: 'sub:1', sendAt: now });
  await e.store.addNotice({
    userId: e.userId,
    kind: 'yillik_30_gun',
    ref: 'sub:1',
    sendAt: new Date('2026-12-01T00:00:00Z'),
  });
  const tick = noticeTick(e.db, () => now);
  expect(await Promise.all([tick(), tick()]).then((r) => r[0] + r[1])).toBe(2);
  expect(await tick()).toBe(0);
  const jobs = (
    await e.pg.query<{ payload: unknown }>(
      "select payload from jobs where type = 'notify.send' order by created_at",
    )
  ).rows;
  expect(jobs).toHaveLength(2);
  const types = jobs.map((j) => NotifyPayload.parse(j.payload).type).sort();
  expect(types).toEqual(['fesih_teyidi', 'odeme']);
  const pending = (
    await e.pg.query<{ n: number }>('select count(*)::int n from notices where sent_at is null')
  ).rows[0]?.n;
  expect(pending).toBe(1);
  await e.pg.close();
}, 60_000);
