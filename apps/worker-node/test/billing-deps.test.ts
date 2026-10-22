import { expect, it } from 'vitest';
import { billingDepsFromEnv, depsFromService } from '../src/billing/deps.ts';

it('stays fail closed without iyzico or secret variables', async () => {
  const pool = {} as never;
  expect(await billingDepsFromEnv(pool, {})).toBeUndefined();
  expect(await billingDepsFromEnv(pool, { IYZICO_API_KEY: 'a', IYZICO_SECRET_KEY: 'b' })).toBeUndefined();
});

it('runs period close, dunning and grants in the daily monthly_grant job', async () => {
  const calls: string[] = [];
  const svc = {
    closeEndedPeriods: async () => void calls.push('close'),
    runDunning: async () => void calls.push('dunning'),
    monthlyGrant: async () => (calls.push('grant'), 3),
    reconcileDay: async () => ({ disabled: true, diffs: [] }),
  };
  const deps = depsFromService(svc as never);
  expect(await deps.monthlyGrant()).toBe(3);
  expect(calls).toEqual(['close', 'dunning', 'grant']);
});
