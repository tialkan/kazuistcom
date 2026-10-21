import { randomUUID } from 'node:crypto';
import { MemoryBillingStore, MemoryLedgerPort } from '../../src/billing/store.ts';
import { runScenarios } from './scenarios.suite.ts';

runScenarios('memory store', async () => {
  const store = new MemoryBillingStore();
  return {
    store,
    ledger: new MemoryLedgerPort(),
    userId: randomUUID(),
    consentKinds: async () => store.consents.map((c) => c.kind),
    alertCount: async () => store.alerts.length,
    addCoupon: async (c) => void store.coupons.set(c.code, c),
    close: async () => {},
  };
});
