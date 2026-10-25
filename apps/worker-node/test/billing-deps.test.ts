import { expect, it } from 'vitest';
import { billingDepsFromEnv, depsFromService } from '../src/billing/deps.ts';

it('stays fail closed without iyzico or secret variables', async () => {
  const pool = {} as never;
  expect(await billingDepsFromEnv(pool, {})).toBeUndefined();
  expect(await billingDepsFromEnv(pool, { IYZICO_API_KEY: 'a', IYZICO_SECRET_KEY: 'b' })).toBeUndefined();
});

it('runs period close, pending rechecks, cancel retries, dunning and grants in the daily monthly_grant job', async () => {
  const calls: string[] = [];
  const svc = {
    closeEndedPeriods: async () => void calls.push('close'),
    recheckPendingOrders: async () => (calls.push('recheck'), 0),
    reconcileCancellations: async () => (calls.push('cancels'), 0),
    runDunning: async () => void calls.push('dunning'),
    reconcileDeletedAccounts: async () => (calls.push('deleted'), 0),
    monthlyGrant: async () => (calls.push('grant'), 3),
    reconcileDay: async () => ({ disabled: true, diffs: [] }),
  };
  const deps = depsFromService(svc as never);
  expect(await deps.monthlyGrant()).toEqual({ granted: 3, failed: [] });
  expect(calls).toEqual(['close', 'recheck', 'cancels', 'deleted', 'dunning', 'grant']);
});
