const L = '/Users/baris/Documents/GitHub/Kazuist/packages/ledger/src';
const { Ledger, LedgerReservationsAdapter, memoryRunner } = await import(`${L}/index.ts`);
const l = new Ledger();
l.grant({ key: 'g', walletId: 'w', source: 'paket', credits: 100, originRef: 'o', now: new Date() });
const a = new LedgerReservationsAdapter(memoryRunner(l), () => 'w');
// two concurrent runs with the same requestId while the first is still open
const r1 = await a.reserve({ userId: 'u', credits: 30, idempotencyKey: 'req-same' });
const r2 = await a.reserve({ userId: 'u', credits: 30, idempotencyKey: 'req-same' });
await a.consume(r1.reservationId, 30);
let e2: any = null; try { await a.consume(r2.reservationId, 30); } catch (x: any) { e2 = x.code; }
console.log('Y7 residual: same id twice while open ->', r1.reservationId === r2.reservationId, '| second consume error:', e2, '| charged total:', 100 - l.balance('w'));
// expired open reservation re-reserved with the same id
const t0 = new Date('2026-10-22T10:00:00Z');
const l2 = new Ledger();
l2.grant({ key: 'g', walletId: 'w', source: 'paket', credits: 100, originRef: 'o', now: t0 });
l2.reserve({ operationId: 'op', walletId: 'w', estimatedCredits: 10, now: t0 });
let e3: any = null; try { l2.reserve({ operationId: 'op', walletId: 'w', estimatedCredits: 10, now: new Date(t0.getTime() + 6 * 60_000) }); } catch (x: any) { e3 = x.code; }
console.log('expired then same id:', e3, '| charged:', 100 - l2.balance('w'));
