/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PrepareRequest } from '@kazuist/contracts';
import pkg from '../package.json' with { type: 'json' };
import {
  BYOK_STORAGE_ITEM,
  ByokError,
  DEFAULT_BYOK_MODEL,
  OPENROUTER_BYOK_MODELS,
  ProviderTimeoutError,
  assertMasked,
  checkOpenRouterKey,
  clearByokSettings,
  isFreeModel,
  isValidModelId,
  keyProblem,
  maskKey,
  readByokSettings,
  runByokClient,
  saveByokSettings,
  scrubParts,
  setFilters,
  type ByokClientEvent,
  type ByokSettings,
  type ByokStorages,
  type FetchLike,
  type ProviderAdapter,
  type StorageLike,
} from '../src/browser.ts';
import { SOURCED_SUMMARY_SYSTEM, buildSourcedPrompt } from '../src/prompt.ts';
import { passage } from './helpers.ts';

/** A made up key for tests; real keys are never written anywhere (CLAUDE.md). */
const KEY = 'sk-or-v1-test-0000000000000000000000000000000000';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const storages = (): ByokStorages & { session: MemoryStorage; local: MemoryStorage } => ({
  session: new MemoryStorage(),
  local: new MemoryStorage(),
});

const settings = (over: Partial<ByokSettings> = {}): ByokSettings => ({
  provider: 'openrouter',
  model: DEFAULT_BYOK_MODEL,
  apiKey: KEY,
  zdr: false,
  persistence: 'oturum',
  ...over,
});

describe('browser entry', () => {
  it('is exported as @kazuist/ai-gateway/browser and pulls in no Node built-ins or process state', () => {
    expect(pkg.exports['./browser']).toBe('./src/browser.ts');
    const src = fileURLToPath(new URL('../src/', import.meta.url));
    const seen = new Set<string>();
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const code = readFileSync(src + file, 'utf8');
      expect(code, file).not.toMatch(/from 'node:|require\(|process\.|console\./);
      for (const m of code.matchAll(/^(?:import|export)(?! type)[^'"]*from '(\.[^']+)'/gm)) {
        visit(new URL(m[1]!, new URL(file, 'file:///x/')).pathname.slice(3));
      }
    };
    visit('browser.ts');
    expect([...seen].sort()).toEqual(
      [
        'browser.ts',
        'adapters/index.ts',
        'adapters/deadline.ts',
        'adapters/sse.ts',
        'types.ts',
        'jsonl.ts',
        'pii.ts',
        'routing.ts',
        'byok/settings.ts',
        'byok/client.ts',
      ].sort(),
    );
  });
});

describe('BYOK key settings (plan 8.3)', () => {
  it('stores in sessionStorage by default and never in localStorage', () => {
    const st = storages();
    expect(saveByokSettings(st, settings())).toBe(true);
    expect(st.session.data.has(BYOK_STORAGE_ITEM)).toBe(true);
    expect(st.local.data.size).toBe(0);
    expect(readByokSettings(st)).toEqual(settings());
  });

  it('"remember on this device" moves the key to localStorage and back without leaving a copy', () => {
    const st = storages();
    saveByokSettings(st, settings({ persistence: 'cihaz', zdr: true }));
    expect(st.session.data.size).toBe(0);
    expect(readByokSettings(st)).toEqual(settings({ persistence: 'cihaz', zdr: true }));
    saveByokSettings(st, settings());
    expect(st.local.data.size).toBe(0);
    expect(readByokSettings(st)?.persistence).toBe('oturum');
  });

  it('clear removes the key from both storages', () => {
    const st = storages();
    st.session.setItem(
      BYOK_STORAGE_ITEM,
      JSON.stringify({ v: 1, provider: 'openrouter', model: 'a/b', apiKey: KEY }),
    );
    st.local.setItem(
      BYOK_STORAGE_ITEM,
      JSON.stringify({ v: 1, provider: 'openrouter', model: 'a/b', apiKey: KEY }),
    );
    clearByokSettings(st);
    expect(st.session.data.size + st.local.data.size).toBe(0);
    expect(readByokSettings(st)).toBeNull();
  });

  it('ignores broken or foreign entries and refuses bad input', () => {
    const st = storages();
    st.session.setItem(BYOK_STORAGE_ITEM, '{not json');
    st.local.setItem(
      BYOK_STORAGE_ITEM,
      JSON.stringify({ v: 1, provider: 'anthropic', model: 'a/b', apiKey: KEY }),
    );
    expect(readByokSettings(st)).toBeNull();
    expect(saveByokSettings(st, settings({ apiKey: 'kisa' }))).toBe(false);
    expect(saveByokSettings(st, settings({ model: 'yalnizad' }))).toBe(false);
    expect(saveByokSettings({ session: null, local: null }, settings())).toBe(false);
  });

  it('survives a browser that refuses storage', () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const st = { session: blocked, local: blocked };
    expect(saveByokSettings(st, settings())).toBe(false);
    expect(readByokSettings(st)).toBeNull();
    expect(() => clearByokSettings(st)).not.toThrow();
  });

  it('validates keys and model IDs, flags free variants and masks the key for display', () => {
    expect(keyProblem('')).toBe('bos');
    expect(keyProblem('sk-or v1 with spaces 1234567890')).toBe('bicim');
    expect(keyProblem(KEY)).toBeNull();
    expect(isValidModelId('anthropic/claude-haiku-5.5')).toBe(true);
    expect(isValidModelId('inclusionai/ling-3.2-flash:free')).toBe(true);
    expect(isValidModelId('https://evil.example/x')).toBe(false);
    expect(isFreeModel('inclusionai/ling-3.2-flash:free')).toBe(true);
    expect(isFreeModel(DEFAULT_BYOK_MODEL)).toBe(false);
    const shown = maskKey(KEY);
    expect(shown.startsWith('sk-or-')).toBe(true);
    expect(shown).not.toContain(KEY.slice(6, -4));
    expect(OPENROUTER_BYOK_MODELS.map((m) => m.id)).toContain(DEFAULT_BYOK_MODEL);
  });
});

/** A bundle as /v1/answers/prepare builds it: scrubbed parts in the Ek D.1 prompt. */
async function bundle(sources = 1) {
  const masked = await scrubParts([
    'Kira tespiti davası açılabilir mi? T.C. 10000000146, telefon 0532 123 45 67.',
    'Uyuşmazlık kira bedelinin tespiti ile ilgilidir. Davacı vekili 0532 123 45 67 numarasını bildirmiştir.',
  ]);
  const prompt = buildSourcedPrompt(masked.parts[0]!, [passage('K1', masked.parts[1]!)]);
  return {
    nonce: 'n'.repeat(32),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    signature: 'sig',
    system: SOURCED_SUMMARY_SYSTEM,
    prompt,
    sources: Array.from({ length: sources }, () => ({
      id: 'K1',
      recordId: '00000000-0000-4000-8000-000000000001',
      title: 'Yargıtay 3. HD',
      authorityClass: 'yuksek_emsal',
      status: 'kesinlesti',
    })),
    passages: { K1: 'Uyuşmazlık kira bedelinin tespiti ile ilgilidir.' },
    limits: { maxInputTokens: 12_000, maxOutputTokens: 400 },
  };
}

const LINES = [
  '{"t":"cumle","metin":"Kira bedelinin tespiti istenebilir.","kaynaklar":["K1"],"alinti":{"K1":"kira bedelinin tespiti"}}',
  '{"t":"son"}',
];

function sse(lines: string[]): Response {
  const frames = lines
    .map((l) => `data: ${JSON.stringify({ choices: [{ delta: { content: `${l}\n` } }] })}\n\n`)
    .join('');
  return new Response(`${frames}data: [DONE]\n\n`, { status: 200 });
}

function harness(opts: { bundle?: unknown; prepareStatus?: number; providerStatus?: number } = {}) {
  const sent: { url: string; init: RequestInit }[] = [];
  const kazuist: { path: string; body: string }[] = [];
  const fetch: FetchLike = async (url, init) => {
    sent.push({ url, init });
    return opts.providerStatus
      ? new Response('{"error":{"message":"x"}}', { status: opts.providerStatus })
      : sse(LINES);
  };
  const deps = {
    fetch,
    prepare: async (body: unknown) => {
      kazuist.push({ path: 'prepare', body: JSON.stringify(body) });
      return new Response(JSON.stringify(opts.bundle ?? (await bundle())), {
        status: opts.prepareStatus ?? 200,
      });
    },
    verify: async (body: { lines: string[] }) => {
      kazuist.push({ path: 'verify', body: JSON.stringify(body) });
      return new Response(
        JSON.stringify({ results: body.lines.map((_, index) => ({ index, ok: true })), abstained: false }),
      );
    },
  };
  return { sent, kazuist, deps };
}

async function collect(it: AsyncIterable<ByokClientEvent>): Promise<ByokClientEvent[]> {
  const out: ByokClientEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('BYOK client protocol (plan 8.1, K-08)', () => {
  it('the key goes only to OpenRouter; Kazuist gets the question and the lines, never the key', async () => {
    const h = harness();
    const events = await collect(runByokClient({ q: 'Kira tespiti?', settings: settings() }, h.deps));
    expect(events.map((e) => e.t)).toEqual(['hazir', 'satir', 'satir', 'dogrulama']);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((h.sent[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(h.sent[0]!.init.body)) as Record<string, unknown>;
    expect(body.provider).toEqual({ data_collection: 'deny' });
    expect(body.model).toBe(DEFAULT_BYOK_MODEL);
    expect(body).not.toHaveProperty('reasoning');
    expect(h.kazuist.map((k) => k.path)).toEqual(['prepare', 'verify']);
    for (const k of h.kazuist) expect(k.body).not.toContain(KEY);
    expect(JSON.parse(h.kazuist[0]!.body)).toEqual({
      q: 'Kira tespiti?',
      provider: 'openrouter',
      model: DEFAULT_BYOK_MODEL,
      depth: 'standart',
    });
    expect(events.at(-1)).toEqual({ t: 'dogrulama', results: [0, 1].map((index) => ({ index, ok: true })) });
  });

  it('sends the search filters to prepare (PrepareRequest.filters, v1.6) and drops unset fields', async () => {
    const h = harness();
    await collect(
      runByokClient(
        {
          q: 'Kira tespiti?',
          filters: { type: 'karar', from: '2020-01-01', to: '', court: 'Yargıtay' },
          settings: settings(),
        },
        h.deps,
      ),
    );
    const body = JSON.parse(h.kazuist[0]!.body) as Record<string, unknown>;
    expect(body.filters).toEqual({ type: 'karar', from: '2020-01-01', court: 'Yargıtay' });
    expect(PrepareRequest.safeParse(body).success).toBe(true);
    expect(h.kazuist[0]!.body).not.toContain(KEY);

    // Only empty fields: no filters key, the body is the same as without filters.
    const empty = harness();
    await collect(
      runByokClient({ q: 'Kira?', filters: { from: '', court: '' }, settings: settings() }, empty.deps),
    );
    expect(JSON.parse(empty.kazuist[0]!.body)).not.toHaveProperty('filters');
    expect(setFilters(undefined)).toBeUndefined();
    expect(setFilters({})).toBeUndefined();
  });

  it('sends only the masked prompt and honours "gizlilik öncelikli" and the model reasoning hint', async () => {
    const h = harness();
    await collect(
      runByokClient({ q: 'Kira?', settings: settings({ zdr: true, model: 'openai/gpt-5.6-luna' }) }, h.deps),
    );
    const body = JSON.parse(String(h.sent[0]!.init.body)) as {
      provider: unknown;
      reasoning: unknown;
      messages: { content: string }[];
    };
    expect(body.provider).toEqual({ data_collection: 'deny', zdr: true });
    expect(body.reasoning).toEqual({ effort: 'none' });
    const userText = body.messages[1]!.content;
    expect(userText).not.toMatch(/10000000146|0532 123 45 67/);
    expect(userText).toContain('[KİMLİK NO-1]');
    expect(userText).toContain('[TELEFON-1]');
  });

  it('without sources nothing is sent to the provider', async () => {
    const h = harness({ bundle: await bundle(0) });
    const events = await collect(runByokClient({ q: 'Kira?', settings: settings() }, h.deps));
    expect(events.map((e) => e.t)).toEqual(['hazir']);
    expect(h.sent).toHaveLength(0);
  });

  it('refuses to send a bundle that still holds personal data', async () => {
    const b = await bundle();
    const h = harness({ bundle: { ...b, prompt: `${b.prompt}\nT.C. 10000000146` } });
    await expect(collect(runByokClient({ q: 'Kira?', settings: settings() }, h.deps))).rejects.toMatchObject({
      kind: 'maskesiz_metin',
    });
    expect(h.sent).toHaveLength(0);
  });

  it('a prompt masked by the server passes the browser check unchanged', async () => {
    await expect(assertMasked((await bundle()).prompt)).resolves.toBeUndefined();
  });

  it.each([
    [401, 'anahtar_gecersiz'],
    [402, 'saglayici_bakiye'],
    [404, 'model_yok'],
    [429, 'saglayici_sinir'],
    [500, 'saglayici'],
  ])('provider %i becomes %s without any provider text', async (status, kind) => {
    const h = harness({ providerStatus: status });
    const err = await collect(runByokClient({ q: 'Kira?', settings: settings() }, h.deps)).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ByokError);
    expect(err).toMatchObject({ kind, status });
    expect(String((err as Error).message)).not.toContain(KEY);
  });

  it('maps prepare failures, network errors and deadlines', async () => {
    const run = (deps: Parameters<typeof runByokClient>[1]) =>
      collect(runByokClient({ q: 'Kira?', settings: settings() }, deps)).catch((e: unknown) => e);
    expect(await run(harness({ prepareStatus: 401 }).deps)).toMatchObject({ kind: 'oturum' });
    expect(await run(harness({ prepareStatus: 503 }).deps)).toMatchObject({ kind: 'hazirlik_yok' });
    expect(await run(harness({ bundle: { nonce: 'x' } }).deps)).toMatchObject({ kind: 'hazirlik' });
    const offline = harness();
    expect(
      await run({ ...offline.deps, fetch: () => Promise.reject(new TypeError('Failed to fetch')) }),
    ).toMatchObject({ kind: 'baglanti' });
    const slow: ProviderAdapter = {
      provider: 'openrouter',
      // eslint-disable-next-line require-yield -- fails before the first chunk
      async *stream() {
        throw new ProviderTimeoutError('openrouter', 'ilk_bayt');
      },
    };
    expect(await run({ ...harness().deps, adapter: slow })).toMatchObject({ kind: 'zaman_asimi' });
  });

  it('a failed verify does not hide a summary the browser already validated', async () => {
    const h = harness();
    const events = await collect(
      runByokClient(
        { q: 'Kira?', settings: settings() },
        { ...h.deps, verify: async () => new Response('{}', { status: 500 }) },
      ),
    );
    expect(events.at(-1)).toEqual({ t: 'dogrulama', results: null });
  });
});

describe('OpenRouter key check (free tier warning, FR-84)', () => {
  const answering =
    (status: number, data?: Record<string, unknown>): FetchLike =>
    async (url, init) => {
      expect(url).toBe('https://openrouter.ai/api/v1/key');
      expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
      return new Response(JSON.stringify({ data }), { status });
    };

  it('reads only the free tier and limit flags', async () => {
    expect(
      await checkOpenRouterKey(KEY, {
        fetch: answering(200, { is_free_tier: true, limit: null, label: 'x' }),
      }),
    ).toEqual({ ok: true, freeTier: true, limited: false });
    expect(
      await checkOpenRouterKey(KEY, { fetch: answering(200, { is_free_tier: false, limit: 5 }) }),
    ).toEqual({
      ok: true,
      freeTier: false,
      limited: true,
    });
  });

  it('maps a refused key, a provider error, a network error and a timeout', async () => {
    expect(await checkOpenRouterKey(KEY, { fetch: answering(401) })).toEqual({
      ok: false,
      kind: 'anahtar_gecersiz',
    });
    expect(await checkOpenRouterKey(KEY, { fetch: answering(500) })).toEqual({
      ok: false,
      kind: 'saglayici',
    });
    expect(
      await checkOpenRouterKey(KEY, { fetch: () => Promise.reject(new TypeError('Failed to fetch')) }),
    ).toEqual({ ok: false, kind: 'baglanti' });
    const hang: FetchLike = (_u, init) =>
      new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    expect(await checkOpenRouterKey(KEY, { fetch: hang, timeoutMs: 20 })).toEqual({
      ok: false,
      kind: 'zaman_asimi',
    });
  });
});

describe('scrubParts (review.md P8.5 separator shift)', () => {
  it('a question containing the internal separator no longer shifts the passages', async () => {
    const r = await scrubParts(['soru \u0000\u0001 enjeksiyon', 'birinci pasaj', 'ikinci pasaj']);
    expect(r.parts).toEqual(['soru  enjeksiyon', 'birinci pasaj', 'ikinci pasaj']);
  });

  it('labels are shared across parts and names never span a boundary', async () => {
    const ner = {
      find: (t: string) => [...t.matchAll(/Ayşe Demir/g)].map((m) => ({ start: m.index, end: m.index + 10 })),
    };
    const r = await scrubParts(['Ayşe Demir sordu', 'Davacı Ayşe Demir, telefon 0532 123 45 67'], ner);
    expect(r.parts).toEqual(['[KİŞİ-1] sordu', 'Davacı [KİŞİ-1], telefon [TELEFON-1]']);
    expect(r.mapping.get('[KİŞİ-1]')).toBe('Ayşe Demir');
  });
});
