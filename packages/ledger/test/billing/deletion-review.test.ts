import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { BillingService } from '../../src/billing/service.ts';
import { MemoryBillingStore, MemoryLedgerPort } from '../../src/billing/store.ts';
import { FakeIyzico, FAKE_CFG } from '../../src/billing/fake-iyzico.ts';
import { FakeEArsiv } from '../../src/billing/earsiv.ts';
const actor = '00000000-0000-4000-8000-000000000099';
async function env(spent = 100) {
  const store = new MemoryBillingStore();
  const ledger = new MemoryLedgerPort();
  const iyz = new FakeIyzico();
  const earsiv = new FakeEArsiv();
  const now = new Date('2026-10-27T00:00:00Z');
  const svc = new BillingService({
    store,
    ledger,
    iyzico: iyz,
    iyzicoCfg: FAKE_CFG,
    earsiv,
    now: () => now,
    newId: randomUUID,
    callbackBaseUrl: 'https://k.test',
    webAddress: 'https://k.test',
  });
  const buyer = {
    id: 'u1',
    name: 'A',
    surname: 'B',
    email: 'a@example.invalid',
    identityNumber: '11111111111',
    ip: '127.0.0.1',
    city: 'Ankara',
    country: 'Turkey',
    address: 'Test',
  };
  const order = await svc.startTopup(
    'u1',
    randomUUID(),
    {
      productCode: 'kredi.300',
      withdrawalWaiver: true,
      preInfoConsentVersion: 'onb',
      distanceContractConsentVersion: 'mss',
    },
    buyer,
  );
  await svc.completeCheckout(store.orders.get(order.orderId)?.checkoutToken as string);
  const wallet = await store.walletOf('u1');
  if (spent)
    await ledger.run(wallet, (l) => {
      l.reserve({ walletId: wallet, operationId: 'spent', estimatedCredits: spent, now });
      l.settle({ walletId: wallet, operationId: 'spent', outcome: 'tamam', actualCredits: spent, now });
    });
  store.deletedUsers.add('u1');
  await svc.onAccountDeletion('u1');
  const request = store.refundRequests[0];
  if (!request) throw new Error('missing deletion request');
  return { svc, store, ledger, iyz, earsiv, request, wallet, order };
}
it('a reasoned rejection has no provider or credit movement and replay is stable', async () => {
  const e = await env();
  const input = { decision: 'ret' as const, reason: 'İncelenen talep kapsam dışında.' };
  const result = await e.svc.decideDeletionRefund(actor, 'review-key', e.request.id, input);
  expect(result.status).toBe('reddedildi');
  expect(e.iyz.refunds).toHaveLength(0);
  expect((await e.svc.wallet('u1')).balance).toBe(200);
  expect(await e.svc.decideDeletionRefund(actor, 'review-key', e.request.id, input)).toEqual(result);
  await expect(
    e.svc.decideDeletionRefund(actor, 'review-key', e.request.id, { decision: 'onay', reason: input.reason }),
  ).rejects.toMatchObject({ status: 409 });
});
it('approval refunds only the unused package share at its original payment and invoices once', async () => {
  const e = await env();
  const input = { decision: 'onay' as const, reason: 'Kullanılmamış kredi payı onaylandı.' };
  const result = await e.svc.decideDeletionRefund(actor, 'approve-key', e.request.id, input);
  expect(result.status).toBe('tamamlandi');
  expect(result.amountKurus).toBe(2600);
  expect(e.iyz.refunds).toHaveLength(1);
  expect(e.iyz.refunds[0]?.priceKurus).toBe(2600);
  expect((await e.svc.wallet('u1')).balance).toBe(0);
  expect(await e.svc.decideDeletionRefund(actor, 'approve-key', e.request.id, input)).toEqual(result);
  await e.svc.executeDeletionRefund(actor, 'execute-key', e.request.id);
  expect(e.iyz.refunds).toHaveLength(1);
  expect(e.earsiv.issued.filter((i) => i.kind === 'iade')).toHaveLength(1);
});
it('unknown refunds stay held, never resend and resolve only in the dedicated queue', async () => {
  const e = await env();
  e.iyz.nextRefund = 'unknown';
  const approved = await e.svc.decideDeletionRefund(actor, 'unknown-key', e.request.id, {
    decision: 'onay',
    reason: 'Kalan paket kredileri için onay.',
  });
  expect(approved.status).toBe('onaylandi');
  expect(approved.items[0]?.state).toBe('bekliyor');
  await e.svc.executeDeletionRefund(actor, 'retry-key', e.request.id);
  expect(e.iyz.refunds).toHaveLength(1);
  expect(await e.svc.listPendingRefunds()).toHaveLength(0);
  const item = approved.items[0];
  if (!item) throw new Error('missing item');
  await expect(e.svc.resolvePendingRefund(item.providerRefundRef, 'basarili', actor)).rejects.toMatchObject({
    status: 409,
  });
  const resolved = await e.svc.resolveDeletionRefundItem(actor, 'resolve-key', e.request.id, item.id, {
    outcome: 'basarili',
    reason: 'Sağlayıcı panelinde iade doğrulandı.',
    providerResultRef: 'panel-ref',
  });
  expect(resolved.status).toBe('tamamlandi');
  expect((await e.svc.wallet('u1')).balance).toBe(0);
  expect(e.iyz.refunds).toHaveLength(1);
});
it('definite provider failure preserves the hold and explicit execution retries once', async () => {
  const e = await env();
  e.iyz.nextRefund = 'definite';
  const r = await e.svc.decideDeletionRefund(actor, 'failed', e.request.id, {
    decision: 'onay',
    reason: 'Paket kullanım payı doğrulandı.',
  });
  expect(r.items[0]?.state).toBe('basarisiz');
  expect((await e.svc.wallet('u1')).balance).toBe(0);
  const result = await e.svc.executeDeletionRefund(actor, 'retry', e.request.id);
  expect(result.status).toBe('tamamlandi');
  expect(e.iyz.refunds).toHaveLength(1);
});
it('an open reservation prevents approval atomically without provider calls', async () => {
  const e = await env();
  await e.ledger.run(e.wallet, (l) =>
    l.reserve({
      walletId: e.wallet,
      operationId: 'open',
      estimatedCredits: 20,
      now: new Date('2026-10-27T00:00:00Z'),
    }),
  );
  await expect(
    e.svc.decideDeletionRefund(actor, 'blocked', e.request.id, {
      decision: 'onay',
      reason: 'Paket kullanım payı doğrulandı.',
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(e.store.deletionRefundItems).toHaveLength(0);
  expect(e.iyz.refunds).toHaveLength(0);
  expect((await e.svc.getDeletionRefundRequest(e.request.id)).status).toBe('bekliyor');
});
it('only unused credits are held and original payment caps prevent cumulative over-refund', async () => {
  const e = await env();
  const payment = [...e.store.payments].find((p) => p.kind === 'odeme');
  if (!payment) throw new Error('missing charge');
  await e.store.addPayment({
    ...payment,
    kind: 'iade',
    refundRef: 'prior',
    amountKurus: 3500,
    status: 'basarili',
  });
  const detail = await e.svc.getDeletionRefundRequest(e.request.id);
  expect(detail.candidates[0]?.maxRefundKurus).toBe(400);
  const r = await e.svc.decideDeletionRefund(actor, 'cap', e.request.id, {
    decision: 'onay',
    reason: 'Önceki iade tutarı dikkate alındı.',
  });
  expect(r.amountKurus).toBe(400);
  expect(e.iyz.refunds[0]?.priceKurus).toBe(400);
});
it('request lookup is restricted to deleted users and excludes the ordinary refund queue', async () => {
  const e = await env();
  e.store.deletedUsers.delete('u1');
  expect((await e.svc.listDeletionRefundRequests('bekliyor')).items).toHaveLength(0);
  await expect(e.svc.getDeletionRefundRequest(e.request.id)).rejects.toMatchObject({ status: 404 });
});
it('same key with a different request body conflicts even after completion', async () => {
  const e = await env();
  await e.svc.decideDeletionRefund(actor, 'hash', e.request.id, {
    decision: 'ret',
    reason: 'İnceleme sonucunda talep reddedildi.',
  });
  await expect(
    e.svc.decideDeletionRefund(actor, 'hash', e.request.id, {
      decision: 'ret',
      reason: 'Farklı bir gerekçe ile reddedildi.',
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it('a second actor cannot replace a completed approval decision', async () => {
  const e = await env();
  await e.svc.decideDeletionRefund(actor, 'original', e.request.id, {
    decision: 'onay',
    reason: 'Kalan paket kredileri için onay.',
  });
  await expect(
    e.svc.decideDeletionRefund('00000000-0000-4000-8000-000000000098', 'other', e.request.id, {
      decision: 'ret',
      reason: 'Karar değiştirilmeye çalışılıyor.',
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(e.iyz.refunds).toHaveLength(1);
});
it('unknown outcome manually confirmed failed requires a new explicit execute call', async () => {
  const e = await env();
  e.iyz.nextRefund = 'unknown';
  const r = await e.svc.decideDeletionRefund(actor, 'approve', e.request.id, {
    decision: 'onay',
    reason: 'Kalan paket kredileri için onay.',
  });
  const item = r.items[0];
  if (!item) throw new Error('missing item');
  const resolved = await e.svc.resolveDeletionRefundItem(actor, 'resolve', r.id, item.id, {
    outcome: 'basarisiz',
    reason: 'Sağlayıcı panelinde kesin başarısızlık doğrulandı.',
  });
  expect(resolved.items[0]?.state).toBe('basarisiz');
  expect(e.iyz.refunds).toHaveLength(1);
  await e.svc.executeDeletionRefund(actor, 'new-execute', r.id);
  expect(e.iyz.refunds).toHaveLength(2);
});

it('chargeback cannot double-count a pending deletion hold and can run after resolution', async () => {
  const e = await env();
  e.iyz.nextRefund = 'unknown';
  const r = await e.svc.decideDeletionRefund(actor, 'approve-hold', e.request.id, {
    decision: 'onay',
    reason: 'Kalan paket kredileri için onay.',
  });
  const item = r.items[0];
  if (!item) throw new Error('missing item');
  await expect(e.svc.chargeback(e.order.orderId, 'chargeback-pending')).rejects.toMatchObject({
    status: 409,
  });
  expect(await e.ledger.run(e.wallet, (l) => l.wallet(e.wallet).debt)).toBe(0);
  await e.svc.resolveDeletionRefundItem(actor, 'resolve-hold', r.id, item.id, {
    outcome: 'basarili',
    reason: 'Sağlayıcı panelinde iade doğrulandı.',
  });
  expect(await e.svc.chargeback(e.order.orderId, 'chargeback-confirmed')).toBe(-100);
});
it('concurrent decisions cannot create duplicate allocations or provider refunds', async () => {
  const e = await env();
  const input = { decision: 'onay' as const, reason: 'Kalan paket kredileri için onay.' };
  const outcomes = await Promise.allSettled([
    e.svc.decideDeletionRefund(actor, 'race-a', e.request.id, input),
    e.svc.decideDeletionRefund(actor, 'race-b', e.request.id, input),
  ]);
  expect(outcomes.some((o) => o.status === 'fulfilled')).toBe(true);
  expect(e.store.deletionRefundItems).toHaveLength(1);
  expect(e.iyz.refunds).toHaveLength(1);
});
it('manual success rolls payment, resolution metadata and ledger reversal back together on persistence failure', async () => {
  const e = await env();
  e.iyz.nextRefund = 'unknown';
  const r = await e.svc.decideDeletionRefund(actor, 'atomic-approve', e.request.id, {
    decision: 'onay',
    reason: 'Kalan paket kredileri için onay.',
  });
  const item = r.items[0];
  if (!item) throw new Error('missing item');
  const original = e.store.setDeletionRefundItemState;
  e.store.setDeletionRefundItemState = async () => {
    throw new Error('injected persistence failure');
  };
  await expect(
    e.svc.resolveDeletionRefundItem(actor, 'atomic-resolve', r.id, item.id, {
      outcome: 'basarili',
      reason: 'Sağlayıcı panelinde iade doğrulandı.',
    }),
  ).rejects.toMatchObject({ status: 502 });
  e.store.setDeletionRefundItemState = original;
  expect((await e.store.findRefund(item.providerRefundRef))?.status).toBe('bekliyor');
  expect(e.store.deletionRefundItems[0]?.resolvedBy).toBeNull();
  expect(await e.ledger.run(e.wallet, (l) => l.reserved(e.wallet))).toBe(200);
  const resolved = await e.svc.resolveDeletionRefundItem(actor, 'atomic-resolve', r.id, item.id, {
    outcome: 'basarili',
    reason: 'Sağlayıcı panelinde iade doğrulandı.',
  });
  expect(resolved.items[0]?.resolvedBy).toBe(actor);
  expect(resolved.status).toBe('tamamlandi');
});
