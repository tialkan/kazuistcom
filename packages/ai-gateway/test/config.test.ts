import { describe, expect, it } from 'vitest';
import {
  BudgetGuard,
  DEFAULT_BUDGET,
  DEFAULT_USD_TRY_RATE,
  FakeLedger,
  MemoryCounterStore,
  ProviderSwitch,
  createGateway,
  dailyBudgetTry,
  platformAiAvailable,
  usdTryRate,
  type CostEvent,
  type RunInput,
} from '../src/index.ts';
import { fakeAdapter, passage } from './helpers.ts';

describe('platform AI availability (key and daily ceiling)', () => {
  const KEY = 'yer-tutucu';
  it('needs a platform key and a positive AI_DAILY_BUDGET_TRY', () => {
    expect(platformAiAvailable({})).toBe(false);
    expect(platformAiAvailable({ OPENROUTER_API_KEY: KEY })).toBe(false);
    expect(platformAiAvailable({ AI_DAILY_BUDGET_TRY: '500' })).toBe(false);
    expect(platformAiAvailable({ OPENROUTER_API_KEY: KEY, AI_DAILY_BUDGET_TRY: '500' })).toBe(true);
    expect(platformAiAvailable({ ANTHROPIC_API_KEY: KEY, AI_DAILY_BUDGET_TRY: '500' })).toBe(true);
  });
  it('counts blank values and a zero, negative or non numeric ceiling as missing', () => {
    expect(platformAiAvailable({ OPENROUTER_API_KEY: '  ', AI_DAILY_BUDGET_TRY: '500' })).toBe(false);
    for (const v of ['', ' ', '0', '-5', 'abc', 'Infinity'])
      expect(platformAiAvailable({ OPENROUTER_API_KEY: KEY, AI_DAILY_BUDGET_TRY: v }), v).toBe(false);
    expect(dailyBudgetTry({ AI_DAILY_BUDGET_TRY: ' 750.5 ' })).toBe(750.5);
  });
});

describe('AI_USD_TRY_RATE', () => {
  it('defaults to the plan 4.4 rate', () => {
    expect(DEFAULT_USD_TRY_RATE).toBe(50);
    expect(usdTryRate({})).toEqual({ rate: 50, invalid: false });
    expect(usdTryRate({ AI_USD_TRY_RATE: ' ' })).toEqual({ rate: 50, invalid: false });
  });
  it('accepts a plain decimal inside the bounds', () => {
    expect(usdTryRate({ AI_USD_TRY_RATE: '49.37' })).toEqual({ rate: 49.37, invalid: false });
    expect(usdTryRate({ AI_USD_TRY_RATE: '1' })).toEqual({ rate: 1, invalid: false });
    expect(usdTryRate({ AI_USD_TRY_RATE: '1000' })).toEqual({ rate: 1000, invalid: false });
  });
  it('rejects typos and keeps the default, flagged so the caller can log the variable name', () => {
    for (const v of ['0', '0.02', '49,37', '50000', '-50', '5e1', '50 TL', 'NaN', '1000.01'])
      expect(usdTryRate({ AI_USD_TRY_RATE: v }), v).toEqual({ rate: 50, invalid: true });
  });
});

describe('the gateway converts platform spend with the configured rate', () => {
  const LINES = '{"t":"cumle","metin":"X.","kaynaklar":["K1"],"alinti":{"K1":"kira bedeli"}}\n{"t":"son"}\n';
  const input: RunInput = {
    requestId: 'r1',
    operation: 'ozet',
    mode: 'platform',
    userId: 'u1',
    userHash: 'uh',
    ipHash: 'ih',
    credits: 2,
    free: false,
    question: 'Kira bedeli nasıl belirlenir?',
    passages: [passage('K1', 'Kira bedeli taraflarca belirlenir.')],
  };

  async function cost(rate?: number): Promise<{ cost: CostEvent; spend: number }> {
    const store = new MemoryCounterStore();
    const costs: CostEvent[] = [];
    const gw = createGateway({
      adapters: { openrouter: fakeAdapter('openrouter', [LINES], { usage: [10_000, 1_000] }) } as never,
      budget: new BudgetGuard(store, DEFAULT_BUDGET, () => new Date('2026-11-15T09:00:00Z')),
      switches: new ProviderSwitch(['openrouter']),
      ledger: new FakeLedger(),
      platformKeys: { openrouter: 'pk-o' },
      sink: () => undefined,
      onCost: (c) => costs.push(c),
      ...(rate === undefined ? {} : { usdTryRate: rate }),
    });
    for await (const ev of gw.run(input)) void ev;
    return { cost: costs[0] as CostEvent, spend: await store.get('spend:tl:2026-11-15') };
  }

  it('uses 50 by default and the given rate otherwise, in the cost event and the spend counter alike', async () => {
    const d = await cost();
    expect(d.cost.costUsd).toBeGreaterThan(0);
    expect(d.cost.costTl).toBeCloseTo(d.cost.costUsd * 50, 10);
    expect(d.spend).toBeCloseTo(d.cost.costTl, 10);
    const c = await cost(42.5);
    expect(c.cost.costTl).toBeCloseTo(c.cost.costUsd * 42.5, 10);
    expect(c.spend).toBeCloseTo(c.cost.costTl, 10);
  });
  it('refuses a rate outside the bounds at construction', async () => {
    await expect(cost(0)).rejects.toThrow(RangeError);
    await expect(cost(Number.NaN)).rejects.toThrow(RangeError);
  });
});
