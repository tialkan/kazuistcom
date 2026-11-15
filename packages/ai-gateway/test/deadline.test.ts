/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BudgetGuard,
  FakeLedger,
  MemoryCounterStore,
  ProviderSwitch,
  ProviderTimeoutError,
  ROUTES,
  createAdapters,
  createGateway,
  openRouterAdapter,
  type CostEvent,
  type FetchLike,
  type GatewayEvent,
  type GatewayMetric,
  type StreamChunk,
} from '../src/index.ts';
import { fakeAdapter, passage } from './helpers.ts';

/** review.md P8.5: provider calls had no deadline. */

const req = { provider: 'openrouter' as const, model: 'm', system: 'S', prompt: 'P', maxOutputTokens: 10 };

/** Never answers; rejects only when the request signal aborts, like a real fetch. */
const hanging: FetchLike = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    const s = init.signal;
    s?.addEventListener('abort', () => reject(s.reason), { once: true });
  });

/** Answers headers and one chunk, then stalls until the request signal aborts the body. */
const stalling =
  (first: string): FetchLike =>
  async (_url, init) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(`data: ${first}\n\n`));
          init.signal?.addEventListener('abort', () => c.error(init.signal?.reason), { once: true });
        },
      }),
      { status: 200 },
    );

async function drain(it: AsyncIterable<StreamChunk>): Promise<string> {
  let text = '';
  for await (const c of it) if (c.type === 'text') text += c.text;
  return text;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('provider deadlines (adapters)', () => {
  it('a provider that never answers fails with ProviderTimeoutError (ilk_bayt) at the first byte deadline', async () => {
    const started = Date.now();
    const err = await drain(
      openRouterAdapter({ fetch: hanging }).stream(req, {
        apiKey: 'k',
        firstByteTimeoutMs: 30,
        timeoutMs: 5_000,
      }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderTimeoutError);
    expect(err).toMatchObject({ phase: 'ilk_bayt', status: 504, provider: 'openrouter' });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('a stream that stalls after output fails with phase akis at the overall deadline', async () => {
    const chunk = JSON.stringify({ choices: [{ delta: { content: 'yarım' } }] });
    const got: string[] = [];
    const err = await (async () => {
      for await (const c of openRouterAdapter({ fetch: stalling(chunk) }).stream(req, {
        apiKey: 'k',
        timeoutMs: 40,
      }))
        if (c.type === 'text') got.push(c.text);
    })().catch((e: unknown) => e);
    expect(got).toEqual(['yarım']);
    expect(err).toMatchObject({ name: 'ProviderTimeoutError', phase: 'akis' });
  });

  it("the caller's abort passes through unchanged and is not reported as a timeout", async () => {
    const ctl = new AbortController();
    const p = drain(openRouterAdapter({ fetch: hanging }).stream(req, { apiKey: 'k', signal: ctl.signal }));
    ctl.abort();
    const err = await p.catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ProviderTimeoutError);
    expect((err as Error).name).toBe('AbortError');
  });

  it('every adapter runs under the deadline', async () => {
    for (const a of Object.values(createAdapters({ fetch: hanging }))) {
      const err = await drain(
        a.stream({ ...req, provider: a.provider }, { apiKey: 'k', firstByteTimeoutMs: 10 }),
      ).catch((e: unknown) => e);
      expect(err, a.provider).toMatchObject({ name: 'ProviderTimeoutError', provider: a.provider });
    }
  });

  it('a fast stream finishes and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const ok: FetchLike = async () =>
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'tamam' } }] })}\n\ndata: [DONE]\n\n`,
      );
    const text = await drain(openRouterAdapter({ fetch: ok }).stream(req, { apiKey: 'k' }));
    expect(text).toBe('tamam');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('provider deadlines (gateway)', () => {
  const OK = [
    '{"t":"cumle","metin":"Kira tespiti davası açılabilir.","kaynaklar":["K1"],"alinti":{"K1":"kira bedelinin tespiti"}}\n',
    '{"t":"son"}\n',
  ];

  function setup(openrouterFetch: FetchLike) {
    const metrics: GatewayMetric[] = [];
    const costs: CostEvent[] = [];
    const ledger = new FakeLedger();
    const anthropic = fakeAdapter('anthropic', OK);
    const gw = createGateway({
      adapters: { ...createAdapters({ fetch: openrouterFetch }), anthropic },
      budget: new BudgetGuard(new MemoryCounterStore()),
      switches: new ProviderSwitch(['openrouter', 'anthropic']),
      ledger,
      platformKeys: { openrouter: 'pk-o', anthropic: 'pk-a' },
      sink: (m) => metrics.push(m),
      onCost: (c) => costs.push(c),
    });
    const input = {
      requestId: 'req-deadline',
      operation: 'ozet' as const,
      mode: 'platform' as const,
      userId: 'u',
      userHash: 'uh',
      ipHash: 'ih',
      credits: 2,
      free: false,
      question: 'Kira tespiti davası açılabilir mi?',
      passages: [passage('K1', 'Uyuşmazlık kira bedelinin tespiti ile ilgilidir.')],
    };
    return { gw, metrics, costs, ledger, anthropic, input };
  }

  it('the route deadline applies and a silent primary falls back to Anthropic before any output', async () => {
    vi.useFakeTimers();
    const { gw, costs, metrics, anthropic, input } = setup(hanging);
    const events: GatewayEvent[] = [];
    const done = (async () => {
      for await (const e of gw.run(input)) events.push(e);
    })();
    await vi.advanceTimersByTimeAsync(20_001);
    await done;
    expect(anthropic.calls).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ t: 'bitti', abstained: false });
    expect(costs[0]).toMatchObject({ provider: 'anthropic', creditsCharged: 2, settlement: 'ok' });
    expect(metrics[0]!.errorKind).toBe('provider_504');
  });

  it('a stall after output is a technical error: no fallback, the hold is released, nothing is charged', async () => {
    vi.useFakeTimers();
    const chunk = JSON.stringify({ choices: [{ delta: { content: '{"t":"cumle"' } }] });
    const { gw, costs, ledger, anthropic, input } = setup(stalling(chunk));
    const done = (async () => {
      for await (const e of gw.run(input)) void e;
    })().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(ROUTES.ozet.timeoutMs + 1);
    expect(await done).toMatchObject({ name: 'ProviderTimeoutError', phase: 'akis' });
    expect(anthropic.calls).toHaveLength(0);
    expect(costs[0]).toMatchObject({ creditsCharged: 0, creditsDue: 0, settlement: 'ok' });
    expect([...ledger.reservations.values()].map((r) => r.state)).toEqual(['released']);
  });
});
