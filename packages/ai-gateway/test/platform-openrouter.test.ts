import { describe, expect, it } from 'vitest';
import {
  BudgetGuard,
  FakeLedger,
  MemoryCounterStore,
  ProviderSwitch,
  costUsd,
  createAdapters,
  createGateway,
  type CostEvent,
  type GatewayEvent,
  type RunInput,
} from '../src/index.ts';
import { fakeAdapter, passage, sseBody } from './helpers.ts';

const LINES =
  '{"t":"cumle","metin":"X.","kaynaklar":["K1"],"alinti":{"K1":"kira bedelinin tespiti"}}\n{"t":"son"}\n';

const input = (over: Partial<RunInput> = {}): RunInput => ({
  requestId: 'r1',
  operation: 'ozet',
  mode: 'platform',
  userId: 'u',
  userHash: 'uh',
  ipHash: 'ih',
  credits: 2,
  free: false,
  question: 'kira tespiti?',
  passages: [passage('K1', 'Uyuşmazlık kira bedelinin tespiti ile ilgilidir.')],
  ...over,
});

async function drain(it: AsyncIterable<GatewayEvent>) {
  const out: GatewayEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('platform provider per ADR-0025', () => {
  it('defaults to OpenRouter with data_collection deny and zdr true, verified model ID and real cost', async () => {
    const bodies: Record<string, unknown>[] = [];
    const urls: string[] = [];
    const fetchFn = async (url: string, init: RequestInit) => {
      urls.push(url);
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return sseBody([
        JSON.stringify({ choices: [{ delta: { content: LINES } }] }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 8000, completion_tokens: 300 } }),
        '[DONE]',
      ]);
    };
    const anthropic = fakeAdapter('anthropic', [LINES]);
    const costs: CostEvent[] = [];
    const gw = createGateway({
      adapters: { ...createAdapters({ fetch: fetchFn }), anthropic },
      budget: new BudgetGuard(new MemoryCounterStore()),
      switches: new ProviderSwitch(),
      ledger: new FakeLedger(),
      platformKeys: { openrouter: 'pk-o', anthropic: 'pk-a' },
      sink: () => undefined,
      onCost: (c) => costs.push(c),
    });
    await drain(gw.run(input()));
    expect(urls).toEqual(['https://openrouter.ai/api/v1/chat/completions']);
    expect(bodies[0]).toMatchObject({
      model: 'anthropic/claude-haiku-5.5',
      provider: { data_collection: 'deny', zdr: true },
    });
    expect(anthropic.calls).toHaveLength(0);
    expect(costs[0]).toMatchObject({ provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' });
    expect(costs[0]?.costUsd).toBeCloseTo(costUsd('claude-haiku-5-5', 8000, 300), 10);
    expect(costs[0]?.costUsd).toBeGreaterThan(0);
  });

  it('uses the Sonnet 5.5 OpenRouter ID for deep summaries', async () => {
    const o = fakeAdapter('openrouter', [LINES]);
    const gw = createGateway({
      adapters: { ...createAdapters({ fetch: () => Promise.reject(new Error('x')) }), openrouter: o },
      budget: new BudgetGuard(new MemoryCounterStore()),
      switches: new ProviderSwitch(),
      ledger: new FakeLedger(),
      platformKeys: { openrouter: 'pk-o' },
      sink: () => undefined,
    });
    await drain(gw.run(input({ operation: 'derin_ozet', credits: 60 })));
    expect(o.calls[0]?.request.model).toBe('anthropic/claude-sonnet-5.5');
  });

  it('falls back to Anthropic direct when OpenRouter fails before output', async () => {
    const anthropic = fakeAdapter('anthropic', [LINES]);
    const costs: CostEvent[] = [];
    const gw = createGateway({
      adapters: {
        ...createAdapters({ fetch: () => Promise.reject(new Error('x')) }),
        openrouter: fakeAdapter('openrouter', [], { failStatus: 503 }),
        anthropic,
      },
      budget: new BudgetGuard(new MemoryCounterStore()),
      switches: new ProviderSwitch(),
      ledger: new FakeLedger(),
      platformKeys: { openrouter: 'pk-o', anthropic: 'pk-a' },
      sink: () => undefined,
      onCost: (c) => costs.push(c),
    });
    await drain(gw.run(input()));
    expect(anthropic.calls[0]?.request.model).toBe('claude-haiku-5-5');
    expect(costs[0]?.provider).toBe('anthropic');
  });
});
