/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BudgetGuard,
  FakeLedger,
  MemoryCounterStore,
  ProviderSwitch,
  SOURCED_SUMMARY_SYSTEM,
  createAdapters,
  createGateway,
  type CostEvent,
  type GatewayEvent,
  type GatewayMetric,
  type ProviderAdapter,
  type RunInput,
} from '../src/index.ts';
import { fakeAdapter, passage, sseBody } from './helpers.ts';

const OK = [
  '{"t":"cumle","metin":"Kira tespiti davası [KİŞİ-1] tarafından açılmıştır.","kaynaklar":["K1"],"alinti":{"K1":"kira bedelinin tespiti"}}\n',
  '{"t":"son"}\n',
];

function setup(
  adapters: Partial<Record<string, ProviderAdapter>>,
  keys = { anthropic: 'pk-a', openrouter: 'pk-o' },
) {
  const metrics: GatewayMetric[] = [];
  const costs: CostEvent[] = [];
  const ledger = new FakeLedger();
  const switches = new ProviderSwitch(['anthropic', 'openrouter']);
  const all = {
    ...createAdapters({ fetch: () => Promise.reject(new Error('no network in tests')) }),
    ...adapters,
  };
  const gw = createGateway({
    adapters: all as never,
    budget: new BudgetGuard(new MemoryCounterStore()),
    switches,
    ledger,
    platformKeys: keys,
    sink: (m) => metrics.push(m),
    onCost: (c) => costs.push(c),
    ner: { find: (t) => [...t.matchAll(/Ayşe Demir/g)].map((m) => ({ start: m.index, end: m.index + 10 })) },
  });
  return { gw, metrics, costs, ledger, switches };
}

const base = (over: Partial<RunInput> = {}): RunInput => ({
  requestId: 'req-1',
  operation: 'ozet',
  mode: 'platform',
  userId: 'user-1',
  userHash: 'uh',
  ipHash: 'ih',
  credits: 2,
  free: false,
  question: 'Ayşe Demir kira tespiti davası açabilir mi? Telefonum 0532 123 45 67.',
  passages: [passage('K1', 'Uyuşmazlık kira bedelinin tespiti ile ilgilidir. Davacı Ayşe Demir.')],
  ...over,
});

async function collect(it: AsyncIterable<GatewayEvent>) {
  const out: GatewayEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('gateway platform mode', () => {
  it('streams lines, sends only masked text, consumes credits and emits matching cost event', async () => {
    const a = fakeAdapter('anthropic', OK, { usage: [8000, 300] });
    const { gw, metrics, costs, ledger } = setup({ anthropic: a });
    const events = await collect(gw.run(base()));
    expect(events.map((e) => e.t)).toEqual(['satir', 'satir', 'bitti']);
    const sent = a.calls[0]!;
    expect(sent.request.system).toBe(SOURCED_SUMMARY_SYSTEM);
    expect(sent.request.model).toBe('claude-haiku-5-5');
    expect(sent.request.maxOutputTokens).toBe(400);
    expect(sent.request.prompt).not.toContain('Ayşe');
    expect(sent.request.prompt).not.toContain('0532');
    expect(sent.request.prompt).toContain('[KİŞİ-1]');
    expect(sent.apiKey).toBe('pk-a');

    const cost = costs[0]!;
    expect(cost).toMatchObject({
      inputTokens: 8000,
      outputTokens: 300,
      creditsCharged: 2,
      provider: 'anthropic',
    });
    expect(cost.costUsd).toBeCloseTo(0.00095, 8);
    const r = ledger.reservations.get(cost.reservationId!);
    expect(r).toMatchObject({ state: 'consumed', charged: 2 });

    const logged = JSON.stringify(metrics);
    for (const s of ['Ayşe', 'kira', 'pk-a', '0532']) expect(logged).not.toContain(s);
    expect(metrics[0]).toMatchObject({ outcome: 'ok', model: 'claude-haiku-5-5', inputTokens: 8000 });
  });

  it('abstention is free: reservation released', async () => {
    const { gw, costs, ledger } = setup({
      anthropic: fakeAdapter('anthropic', ['{"t":"yetersiz","neden":"x"}\n{"t":"son"}\n']),
    });
    const events = await collect(gw.run(base()));
    expect(events.at(-1)).toMatchObject({ t: 'bitti', abstained: true });
    expect(costs[0]!.creditsCharged).toBe(0);
    expect(ledger.reservations.get(costs[0]!.reservationId!)!.state).toBe('released');
  });

  it('kill switch routes to the fallback provider', async () => {
    const a = fakeAdapter('anthropic', OK);
    const o = fakeAdapter('openrouter', OK);
    const { gw, switches, costs } = setup({ anthropic: a, openrouter: o });
    switches.disable('anthropic');
    await collect(gw.run(base()));
    expect(a.calls).toHaveLength(0);
    expect(o.calls[0]!.request.model).toBe('anthropic/claude-haiku-5.5');
    expect(costs[0]!.provider).toBe('openrouter');
  });

  it('falls back when the primary provider fails before output', async () => {
    const o = fakeAdapter('openrouter', OK);
    const { gw } = setup({ anthropic: fakeAdapter('anthropic', [], { failStatus: 529 }), openrouter: o });
    const events = await collect(gw.run(base()));
    expect(events.at(-1)?.t).toBe('bitti');
    expect(o.calls).toHaveLength(1);
  });

  it('technical error releases the reservation and logs no content', async () => {
    const { gw, ledger, metrics, switches } = setup({});
    switches.disable('anthropic');
    switches.disable('openrouter');
    await expect(collect(gw.run(base()))).rejects.toMatchObject({ status: 503 });
    expect([...ledger.reservations.values()].every((r) => r.state === 'released')).toBe(true);
    expect(metrics[0]!.outcome).toBe('hata');
  });

  it('rejects input beyond the route limit', async () => {
    const { gw } = setup({ anthropic: fakeAdapter('anthropic', OK) });
    await expect(
      collect(gw.run(base({ passages: [passage('K1', 'a'.repeat(40_000))] }))),
    ).rejects.toMatchObject({ status: 413 });
  });
});

describe('gateway BYOK relay mode', () => {
  it('uses the user key only for the call, charges nothing, never logs the key', async () => {
    const o = fakeAdapter('openrouter', OK);
    const { gw, metrics, costs } = setup({ openrouter: o });
    const key = 'sk-or-user-key-in-memory';
    await collect(
      gw.run(
        base({
          mode: 'byok_aktarma',
          byok: { provider: 'openrouter', model: 'x/y', apiKey: key, openRouter: { zdr: true } },
        }),
      ),
    );
    expect(o.calls[0]!.apiKey).toBe(key);
    expect(costs[0]).toMatchObject({ creditsCharged: 0, costUsd: 0, reservationId: null });
    expect(JSON.stringify(metrics) + JSON.stringify(costs)).not.toContain(key);
  });

  it('closes Gemini BYOK without a paid billing declaration, even for public sources', async () => {
    const g = fakeAdapter('gemini', OK);
    const { gw } = setup({ gemini: g });
    for (const geminiBilling of [undefined, 'ucretsiz', 'bilinmiyor'] as const) {
      await expect(
        collect(
          gw.run(
            base({
              mode: 'byok_aktarma',
              content: 'kamu_kaynak',
              byok: {
                provider: 'gemini',
                model: 'g',
                apiKey: 'k',
                ...(geminiBilling ? { geminiBilling } : {}),
              },
            }),
          ),
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect(g.calls).toHaveLength(0);
    await collect(
      gw.run(
        base({
          mode: 'byok_aktarma',
          content: 'yayimlanmamis_taslak',
          byok: { provider: 'gemini', model: 'g', apiKey: 'k', geminiBilling: 'ucretli' },
        }),
      ),
    );
    expect(g.calls).toHaveLength(1);
  });
});

describe('prompt injection set (plan 8.7/5)', () => {
  const set = JSON.parse(readFileSync(new URL('./fixtures/enjeksiyon.json', import.meta.url), 'utf8')) as {
    id: string;
    metin: string;
  }[];

  it.each(set)('$id: system stays fixed, passage stays data, no tools are sent', async ({ metin }) => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return sseBody([
        JSON.stringify({
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: '{"t":"yetersiz","neden":"x"}\n{"t":"son"}\n' },
        }),
      ]);
    };
    const anthropic = createAdapters({ fetch: fetchFn }).anthropic;
    const { gw } = setup({ anthropic });
    await collect(gw.run(base({ passages: [passage('K1', metin)] })));
    const body = bodies[0]!;
    expect(body.system).toBe(SOURCED_SUMMARY_SYSTEM);
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
    const msgs = body.messages as { role: string; content: string }[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe('user');
    const prompt = msgs[0]!.content;
    // Exactly one opening and closing tag: the passage cannot break out of its block.
    expect(prompt.match(/<\/kaynak>/g)).toHaveLength(1);
    expect(prompt.match(/<kaynak /g)).toHaveLength(1);
    expect(prompt).not.toContain('<sistem>');
  });

  it('a model line citing an unknown source is still only data for the validator (shape passes, ids checked in casuist)', async () => {
    const { gw } = setup({
      anthropic: fakeAdapter('anthropic', ['plain text answer\n', '{"t":"son"}\n']),
    });
    const ev = await collect(gw.run(base()));
    expect(ev.map((e) => e.t)).toEqual(['gecersiz', 'satir', 'bitti']);
    expect(ev.at(-1)).toMatchObject({ abstained: true });
  });
});
