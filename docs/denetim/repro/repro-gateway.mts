const G = '/Users/baris/Documents/GitHub/Kazuist/packages/ai-gateway';
const { BudgetGuard, MemoryCounterStore, ProviderSwitch, createAdapters, createGateway } = await import(`${G}/src/index.ts`);
const { fakeAdapter, passage } = await import(`${G}/test/helpers.ts`);
const L = '/Users/baris/Documents/GitHub/Kazuist/packages/ledger/src';
const { Ledger, LedgerReservationsAdapter, memoryRunner } = await import(`${L}/index.ts`);
const OK = ['{"t":"cumle","metin":"X.","kaynaklar":["K1"],"alinti":{"K1":"kira bedelinin tespiti"}}\n', '{"t":"son"}\n'];
const ledger = new Ledger();
const adapter = new LedgerReservationsAdapter(memoryRunner(ledger), () => 'w-empty');
const gw = createGateway({
  adapters: { ...createAdapters({ fetch: () => Promise.reject(new Error('no network')) }), anthropic: fakeAdapter('anthropic', OK, { usage: [10, 10] }) } as never,
  budget: new BudgetGuard(new MemoryCounterStore()),
  switches: new ProviderSwitch(['anthropic', 'openrouter']),
  ledger: adapter,
  platformKeys: { anthropic: 'pk-a' },
  sink: () => undefined,
});
const input = (i: number) => ({ requestId: `req-${i}`, operation: 'ozet', mode: 'platform', userId: 'u', userHash: 'uh', ipHash: 'ih', credits: 2, free: false,
  question: 'kira tespiti?', passages: [passage('K1', 'Uyuşmazlık kira bedelinin tespiti ile ilgilidir.')] });
for (let i = 1; i <= 3; i++) {
  try { for await (const _ of gw.run(input(i) as never)) {} console.log(i, 'ok'); }
  catch (e: any) { console.log(i, 'error:', e.code ?? e.name, e.message); }
}
// top up and try again: still blocked?
ledger.grant({ key: 'g', walletId: 'w-empty', source: 'paket', credits: 100, originRef: 'o', now: new Date() });
try { for await (const _ of gw.run(input(9) as never)) {} console.log('after top-up ok'); } catch (e: any) { console.log('after top-up error:', e.code ?? e.name, e.message); }
