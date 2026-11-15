/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeLedger,
  MemoryCounterStore,
  MemoryNonceStore,
  ProviderError,
  type CompletionRequest,
  type ProviderAdapter,
  type StreamChunk,
} from '@kazuist/ai-gateway';
import type { AnswerEvent, AnswerFilters, ByokProvider } from '@kazuist/contracts';
import byokMetin from '@kazuist/i18n/tr/byok.json' with { type: 'json' };
import { api, createHarness, signUp, type Harness } from '@/server/auth/__tests__/harness';
import { eq } from 'drizzle-orm';
import { schema } from '@/server/auth/db';
import { MemoryRateLimitStore, RateLimiter } from '@/server/auth/rate-limit';
import { byokOzet, kazuistDeps } from '../_bilesen/byok.ts';
import type { SearchBackend } from '@kazuist/casuist';
import { getSearchDeps, setSearchDeps } from './baglam.ts';
import {
  buildSummaryDeps,
  GatewayConfigError,
  platformCapAlert,
  setSummaryDeps,
  type SummaryDeps,
} from './gecit.ts';
import { answersPost, preparePost, verifyPost } from './ozet.ts';

/**
 * POST /v1/answers with a fake provider (taklit sağlayıcı): the real gateway (masking, budget, ledger hold) and the
 * real validator run; only the model is replaced. No network call is made.
 */

let h: Harness;
let token: string;
let userId: string;
let ledger: FakeLedger;
let counters: MemoryCounterStore;
let deps: SummaryDeps;
let lines: () => string[];
const prompts: string[] = [];
const requests: CompletionRequest[] = [];
const saved = { ...process.env };

function fake(provider: ByokProvider): ProviderAdapter {
  return {
    provider,
    async *stream(req): AsyncIterable<StreamChunk> {
      prompts.push(req.prompt);
      requests.push(req);
      if (process.env.TEST_PROVIDER_FAIL) throw new ProviderError(provider, 500);
      for (const l of lines()) yield { type: 'text', text: `${l}\n` };
      yield { type: 'usage', inputTokens: 1000, outputTokens: 80 };
    },
  };
}

const GOOD = JSON.stringify({
  t: 'cumle',
  metin: 'KVKK m.11 uyarınca herkes kişisel veri işlenip işlenmediğini öğrenebilir.',
  kaynaklar: ['K1'],
  alinti: { K1: 'Kişisel veri işlenip işlenmediğini öğrenme' },
});
const FAKE_QUOTE = JSON.stringify({
  t: 'cumle',
  metin: 'Herkes bilgi isteyebilir.',
  kaynaklar: ['K1'],
  alinti: { K1: 'kaynakta hiç geçmeyen bir alıntı cümlesi' },
});
const SON = '{"t":"son"}';

function build(): SummaryDeps {
  ledger = new FakeLedger();
  counters = new MemoryCounterStore();
  const adapters = {
    anthropic: fake('anthropic'),
    openrouter: fake('openrouter'),
    openai: fake('openai'),
    gemini: fake('gemini'),
  };
  return buildSummaryDeps(
    {
      adapters,
      ledger,
      counters,
      nonces: new MemoryNonceStore(),
      platformKeys: { openrouter: 'test-platform-key' },
      // Built at run time: a literal would look like a key to the secret scanner.
      signingSecret: 'x'.repeat(48),
      hashSecret: 'test-hash',
      sink: () => undefined,
    },
    {},
  );
}

let seq = 0;
const post = (handler: typeof answersPost, path: string, body: unknown, t: string | null = token) =>
  handler(
    api(path, t, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { origin: 'http://localhost:3000', 'idempotency-key': `istek-${++seq}-abcdef` },
    }),
  );

async function events(res: Response): Promise<AnswerEvent[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter(Boolean)
    .map(
      (f) =>
        JSON.parse(
          f
            .split('\n')
            .find((l) => l.startsWith('data: '))!
            .slice(6),
        ) as AnswerEvent,
    );
}

beforeAll(async () => {
  process.env.KAZUIST_ARAMA_KAYNAGI = 'fikstur';
  delete process.env.VALKEY_URL;
  setSearchDeps(undefined);
  h = await createHarness();
  token = (await signUp('ozet@example.com')).token;
  const [u] = await h.db.select({ id: schema.users.id }).from(schema.users);
  userId = u!.id;
  // The free allowance needs a verified e-mail (kimlik); the unverified case has its own test.
  await h.db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, userId));
}, 60_000);
afterAll(() => {
  setSummaryDeps(undefined);
  process.env = saved;
});
beforeEach(() => {
  // Each case starts with a fresh per user limit (20 summaries per 10 minutes).
  h.ctx.limiter = new RateLimiter(new MemoryRateLimitStore());
  delete process.env.TEST_PROVIDER_FAIL;
  deps = build();
  setSummaryDeps(deps);
  prompts.length = 0;
  requests.length = 0;
  lines = () => [GOOD, SON];
});

describe('POST /v1/answers', () => {
  it('requires a session and an Idempotency-Key', async () => {
    expect((await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }, null)).status).toBe(401);
    const noKey = await answersPost(
      api('/v1/answers', token, {
        method: 'POST',
        body: JSON.stringify({ q: 'KVKK m.11' }),
        headers: { origin: 'http://localhost:3000' },
      }),
    );
    expect(noKey.status).toBe(400);
  });

  it('streams sources, fixed warnings, validated sentences and son; free use counted', async () => {
    const res = await post(answersPost, '/v1/answers', { q: 'KVKK m.11' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const ev = await events(res);
    expect(ev.map((e) => e.t)).toEqual(['kaynaklar', 'uyari', 'uyari', 'cumle', 'son']);
    const k = ev[0] as Extract<AnswerEvent, { t: 'kaynaklar' }>;
    expect(k.kaynaklar[0]?.title).toMatch(/m\.11 İlgili kişinin hakları/);
    expect(ev[3]).toMatchObject({ t: 'cumle', index: 0, kaynaklar: ['K1'], destekleyici: false });
    expect(ev[4]).toMatchObject({ t: 'son', creditsCharged: 0, droppedLines: 0 });
    // The prompt carries the Ek D passage format and the masked question only.
    expect(prompts[0]).toContain('<kaynak id="K1" tur="mevzuat" otorite="baglayici_norm" durum="yururlukte"');
    expect(ledger.reservations.size).toBe(0);
  });

  it('drops a sentence whose quote is not in its source and abstains without charging', async () => {
    lines = () => [FAKE_QUOTE, SON];
    const ev = await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }));
    expect(ev.map((e) => e.t)).toEqual(['kaynaklar', 'uyari', 'uyari', 'cekimser', 'son']);
    expect(ev[3]).toMatchObject({ neden: 'dogrulanamadi' });
    expect(ev[4]).toMatchObject({ creditsCharged: 0, droppedLines: 1 });
  });

  it('uses credits after the daily free allowance and releases them when nothing is validated', async () => {
    for (let i = 0; i < 2; i++) await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }));
    const paid = await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }));
    expect(paid.at(-1)).toMatchObject({ t: 'son', creditsCharged: 2 });
    expect([...ledger.reservations.values()].map((r) => [r.state, r.charged])).toEqual([['consumed', 2]]);

    lines = () => [FAKE_QUOTE, SON];
    const abstained = await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }));
    expect(abstained.at(-1)).toMatchObject({ t: 'son', creditsCharged: 0 });
    const states = [...ledger.reservations.values()].map((r) => [r.state, r.charged]);
    expect(states).toEqual([
      ['consumed', 2],
      ['released', 0],
    ]);
  });

  it('returns the free use when the summary abstains', async () => {
    lines = () => ['{"t":"yetersiz","neden":"yok"}', SON];
    for (let i = 0; i < 3; i++) await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }));
    lines = () => [GOOD, SON];
    const ev = await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }));
    // Still free: the three abstentions did not use the allowance.
    expect(ev.at(-1)).toMatchObject({ creditsCharged: 0 });
    expect(ledger.reservations.size).toBe(0);
  });

  it('gives no free summary to an account whose e-mail is not verified; it pays with credits', async () => {
    const other = (await signUp('dogrulanmamis@example.com')).token;
    const ev = await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }, other));
    expect(ev.at(-1)).toMatchObject({ t: 'son', creditsCharged: 2 });
    expect([...ledger.reservations.values()].map((r) => [r.state, r.charged])).toEqual([['consumed', 2]]);
  });

  it('gives edu.tr verified users five free summaries', async () => {
    await h.db.insert(schema.eduVerifications).values({
      userId,
      email: 'ogrenci@uni.edu.tr',
      codeHash: 'x',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: new Date(),
    });
    for (let i = 0; i < 5; i++) {
      const ev = await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }));
      expect(ev.at(-1)).toMatchObject({ creditsCharged: 0 });
    }
    const sixth = await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }));
    expect(sixth.at(-1)).toMatchObject({ creditsCharged: 2 });
    await h.db.delete(schema.eduVerifications);
  });

  it('abstains at once without sources and never calls the provider', async () => {
    const ev = await events(await post(answersPost, '/v1/answers', { q: 'zzqqxx yyww' }));
    expect(ev.map((e) => e.t)).toEqual(['kaynaklar', 'uyari', 'uyari', 'cekimser', 'son']);
    expect(prompts).toEqual([]);
  });

  it('maps provider failure before output to 503 and keeps the free use', async () => {
    process.env.TEST_PROVIDER_FAIL = '1';
    const res = await post(answersPost, '/v1/answers', { q: 'KVKK m.11' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'unavailable' });
    delete process.env.TEST_PROVIDER_FAIL;
    for (let i = 0; i < 2; i++) {
      const ev = await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }));
      expect(ev.at(-1)).toMatchObject({ creditsCharged: 0 });
    }
  });

  it('BYOK relay needs the yz_aktarim consent and never reserves platform credits', async () => {
    const body = {
      q: 'KVKK m.11',
      mode: 'byok_aktarma',
      byok: { provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'sk-test' },
    };
    expect((await post(answersPost, '/v1/answers', body)).status).toBe(403);
    await h.db
      .insert(schema.consents)
      .values({ userId, userHash: 'h', kind: 'yz_aktarim', version: '2026-10-23.1', granted: true });
    const ev = await events(await post(answersPost, '/v1/answers', body));
    expect(ev.at(-1)).toMatchObject({ t: 'son', creditsCharged: 0 });
    expect(ledger.reservations.size).toBe(0);
  });

  it('a client that cancels the stream frees its slot: cancelled summaries never block the next one', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await post(answersPost, '/v1/answers', { q: 'KVKK m.11' });
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      await reader.read();
      await reader.cancel();
    }
    // Let the stream close callbacks settle the cancelled runs.
    await new Promise((r) => setTimeout(r, 20));
    const ev = await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11' }));
    expect(ev.at(-1)).toMatchObject({ t: 'son' });
    // Every hold of a cancelled paid run was released, none consumed.
    const states = [...ledger.reservations.values()].map((r) => r.state);
    expect(states.slice(0, -1).every((s) => s === 'released')).toBe(true);
  });

  it('the deep summary asks the platform Sonnet call for low reasoning effort', async () => {
    const ev = await events(await post(answersPost, '/v1/answers', { q: 'KVKK m.11', depth: 'derin' }));
    expect(ev.at(-1)).toMatchObject({ t: 'son', creditsCharged: 60 });
    expect(requests[0]).toMatchObject({ model: 'anthropic/claude-sonnet-5.5', reasoningEffort: 'low' });
  });

  it('masks personal identifiers in the question before the provider sees it', async () => {
    await events(
      await post(answersPost, '/v1/answers', {
        q: 'KVKK m.11 başvurusu, telefonum 0532 123 45 67, Av. Mehmet Yılmaz',
      }),
    );
    expect(prompts[0]).not.toContain('0532');
    expect(prompts[0]).not.toContain('Mehmet');
    expect(prompts[0]).toContain('[TELEFON-1]');
  });
});

describe('BYOK client protocol: prepare and verify', () => {
  it('signs a bundle with the Ek D system text and verifies lines once', async () => {
    const res = await post(preparePost, '/v1/answers/prepare', {
      q: 'KVKK m.11',
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    });
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.system).toContain("Sen Kazuist'in kaynak bağlama motorusun.");
    expect(b.prompt).toContain('<kaynaklar>');
    expect(b.passages.K1).toMatch(/İlgili kişinin hakları/);
    expect(b.limits).toEqual({ maxInputTokens: 12000, maxOutputTokens: 400 });
    expect(Date.parse(b.expiresAt) - Date.now()).toBeGreaterThan(9 * 60_000);

    const verify = (signature = b.signature) =>
      post(verifyPost, '/v1/answers/verify', { nonce: b.nonce, signature, lines: [GOOD, FAKE_QUOTE, SON] });
    const ok = await verify();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      results: [
        { index: 0, ok: true, reason: null },
        { index: 1, ok: false, reason: 'alinti_bulunamadi' },
        { index: 2, ok: true, reason: null },
      ],
      abstained: false,
      savedId: null,
    });
    // Single use nonce: 410 on reuse.
    expect((await verify()).status).toBe(410);
  });

  it('binds the bundle to the signed in user: another account gets 403', async () => {
    const other = (await signUp('ozet-baska@example.com')).token;
    const b = await (
      await post(preparePost, '/v1/answers/prepare', { q: 'KVKK m.11', provider: 'openai', model: 'gpt-x' })
    ).json();
    const theirs = await post(
      verifyPost,
      '/v1/answers/verify',
      { nonce: b.nonce, signature: b.signature, lines: [GOOD] },
      other,
    );
    expect(theirs.status).toBe(403);
  });

  it('verifies against the passages in the store: a source changed after prepare answers 409', async () => {
    const b = await (
      await post(preparePost, '/v1/answers/prepare', { q: 'KVKK m.11', provider: 'openai', model: 'gpt-x' })
    ).json();
    const real = await getSearchDeps();
    const changed: SearchBackend = {
      name: real.backend.name,
      identity: (...a) => real.backend.identity(...a),
      fullText: (...a) => real.backend.fullText(...a),
      records: (ids) => real.backend.records(ids),
      passages: (...a) => real.backend.passages(...a),
      // The passage text the model saw is replaced in the store by one that contains the fabricated quote.
      chunks: async (ids) =>
        (await real.backend.chunks(ids)).map((c) => ({
          ...c,
          text: `kaynakta hiç geçmeyen bir alıntı cümlesi ${c.text}`,
        })),
    };
    setSearchDeps({ ...real, backend: changed });
    try {
      const res = await post(verifyPost, '/v1/answers/verify', {
        nonce: b.nonce,
        signature: b.signature,
        lines: [FAKE_QUOTE],
      });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'conflict' });
    } finally {
      setSearchDeps(undefined);
    }
  });

  it('prepare retrieves with PrepareRequest.filters, exactly like POST /v1/answers', async () => {
    const Q = 'veri sorumlusu ilgili kişinin şikayeti';
    const LAW = 'Kişisel Verilerin Korunması Kanunu';
    const BOARD = 'Kişisel Verileri Koruma Kurulu';
    const titles = (chips: { title: string }[]) => chips.map((c) => c.title);
    const prepare = async (q: string, filters?: unknown) => {
      const res = await post(preparePost, '/v1/answers/prepare', {
        q,
        provider: 'openai',
        model: 'gpt-x',
        ...(filters ? { filters } : {}),
      });
      expect(res.status).toBe(200);
      return (await res.json()) as { sources: { title: string }[]; prompt: string };
    };
    const answerSources = async (q: string, filters: unknown) => {
      const ev = await events(await post(answersPost, '/v1/answers', { q, filters }));
      return titles((ev[0] as Extract<AnswerEvent, { t: 'kaynaklar' }>).kaynaklar);
    };

    // Without filters the law articles (2016) and the board decision (2024) both supply passages.
    const all = titles((await prepare(Q)).sources);
    expect(all.some((t) => t.startsWith(LAW))).toBe(true);
    expect(all.some((t) => t.startsWith(BOARD))).toBe(true);

    // Type filter: only the board decision.
    const board = titles((await prepare(Q, { type: 'kurul_karari' })).sources);
    expect(board.length).toBeGreaterThan(0);
    expect(board.every((t) => t.startsWith(BOARD))).toBe(true);
    // The platform summary with the same filters picks the same sources (the BYOK note "filtre" is gone).
    expect(await answerSources(Q, { type: 'kurul_karari' })).toEqual(board);

    // Date filter: from 2024 on the 2016 law drops out, the 2024 and 2025 decisions stay.
    const recent = await prepare(Q, { from: '2024-01-01' });
    expect(recent.sources.length).toBeGreaterThan(0);
    expect(titles(recent.sources).some((t) => t.startsWith(LAW))).toBe(false);
    expect(recent.prompt).not.toMatch(/tarih="2016-04-07"/);
    expect(await answerSources(Q, { from: '2024-01-01' })).toEqual(titles(recent.sources));

    // A range that excludes every matching record leaves nothing to summarise, in both modes.
    expect((await prepare('KVKK m.11', { to: '2015-12-31' })).sources).toEqual([]);
    expect(await answerSources('KVKK m.11', { to: '2015-12-31' })).toEqual([]);
  });

  it('refuses filters outside the contract (strict AnswerFilters) with 400', async () => {
    for (const filters of [{ authority: 'baglayici_norm' }, { from: '15.11.2026' }, { type: 'dilekce' }]) {
      const res = await post(preparePost, '/v1/answers/prepare', {
        q: 'KVKK m.11',
        provider: 'openai',
        model: 'gpt-x',
        filters,
      });
      expect(res.status).toBe(400);
    }
    expect(prompts).toEqual([]);
  });

  it('refuses a question with control characters at both summary edges (contract QuestionText)', async () => {
    for (const q of ['KVKK m.11 \u0000\u0001 sahte', 'KVKK\u0007 m.11', 'KVKK m.11\u007f']) {
      expect(
        (await post(preparePost, '/v1/answers/prepare', { q, provider: 'openai', model: 'gpt-x' })).status,
      ).toBe(400);
      expect((await post(answersPost, '/v1/answers', { q })).status).toBe(400);
    }
    // Tabs and line breaks are ordinary whitespace and stay allowed.
    expect(
      (
        await post(preparePost, '/v1/answers/prepare', {
          q: 'KVKK\tm.11\n',
          provider: 'openai',
          model: 'gpt-x',
        })
      ).status,
    ).toBe(200);
    expect(prompts).toEqual([]);
  });

  it('rejects a forged signature', async () => {
    const b = await (
      await post(preparePost, '/v1/answers/prepare', { q: 'KVKK m.11', provider: 'openai', model: 'gpt-x' })
    ).json();
    const res = await post(verifyPost, '/v1/answers/verify', {
      nonce: b.nonce,
      signature: 'AAAA',
      lines: [],
    });
    expect(res.status).toBe(400);
  });
});

describe('BYOK istemci end to end: browser module against the real prepare and verify handlers', () => {
  /** Made up key; real keys are never written anywhere (CLAUDE.md). */
  const KEY = 'sk-or-v1-test-1111111111111111111111111111111111';

  function wiring(modelLines: string[]) {
    const kazuist: { path: string; body: string; headers: string }[] = [];
    const provider: { url: string; headers: Record<string, string>; body: string }[] = [];
    const toKazuist = async (path: string, init: RequestInit) => {
      kazuist.push({ path, body: String(init.body), headers: JSON.stringify(init.headers) });
      const handler = path.endsWith('/prepare') ? preparePost : verifyPost;
      return post(handler, path.replace('/api', ''), JSON.parse(String(init.body)));
    };
    const toProvider = async (url: string, init: RequestInit) => {
      provider.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
      const frames = modelLines
        .map((l) => `data: ${JSON.stringify({ choices: [{ delta: { content: `${l}\n` } }] })}\n\n`)
        .join('');
      return new Response(`${frames}data: [DONE]\n\n`);
    };
    return { kazuist, provider, toKazuist, toProvider };
  }

  async function run(q: string, modelLines: string[], filters?: AnswerFilters) {
    const w = wiring(modelLines);
    const emitted: AnswerEvent[] = [];
    const result = await byokOzet({
      q,
      ...(filters ? { filters } : {}),
      settings: {
        provider: 'openrouter',
        model: 'anthropic/claude-haiku-5.5',
        apiKey: KEY,
        zdr: false,
        persistence: 'oturum',
      },
      emit: (e) => emitted.push(e),
      deps: { ...kazuistDeps(w.toKazuist), fetch: w.toProvider },
    });
    return { ...w, emitted, result };
  }

  it('shows validated sentences, keeps the key away from Kazuist and burns the nonce with verify', async () => {
    const r = await run('KVKK m.11 kapsamındaki haklar nelerdir?', [GOOD, FAKE_QUOTE, SON]);
    expect(r.emitted.map((e) => e.t)).toEqual(['kaynaklar', 'uyari', 'uyari', 'cumle', 'son']);
    expect(r.emitted.find((e) => e.t === 'cumle')).toMatchObject({ index: 0, kaynaklar: ['K1'] });
    expect(r.emitted.at(-1)).toMatchObject({ t: 'son', creditsCharged: 0, droppedLines: 1 });
    expect(r.result.removed).toEqual([]);
    expect(r.kazuist.map((k) => k.path)).toEqual(['/api/v1/answers/prepare', '/api/v1/answers/verify']);
    for (const k of r.kazuist) expect(k.body + k.headers).not.toContain(KEY);
    expect(r.provider).toHaveLength(1);
    expect(r.provider[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(r.provider[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(r.provider[0]!.body).provider).toEqual({ data_collection: 'deny' });
    // No platform credit was reserved.
    expect(ledger.reservations.size).toBe(0);
    // verify consumed the single use nonce.
    const verifyBody = JSON.parse(r.kazuist[1]!.body) as { nonce: string; signature: string };
    expect((await post(verifyPost, '/v1/answers/verify', { ...verifyBody, lines: [] })).status).toBe(410);
  });

  it('masks personal identifiers before the provider sees them', async () => {
    const r = await run('KVKK m.11 T.C. 10000000146 numaralı başvurum, tel 0532 123 45 67', [GOOD, SON]);
    const sent = JSON.parse(r.provider[0]!.body) as { messages: { content: string }[] };
    const userText = sent.messages[1]!.content;
    expect(userText).not.toMatch(/10000000146|0532 123 45 67/);
    expect(userText).toContain('[KİMLİK NO-1]');
    expect(r.emitted.find((e) => e.t === 'cumle')).toBeTruthy();
  });

  it('sends the page filters to prepare: the sources come from the filtered records, as in platform mode', async () => {
    const r = await run('veri sorumlusu ilgili kişinin şikayeti', [SON], {
      type: 'kurul_karari',
      from: '2024-01-01',
    });
    const prepared = JSON.parse(r.kazuist[0]!.body) as { filters?: unknown };
    expect(prepared.filters).toEqual({ type: 'kurul_karari', from: '2024-01-01' });
    const chips = (r.emitted[0] as Extract<AnswerEvent, { t: 'kaynaklar' }>).kaynaklar;
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => c.title.startsWith('Kişisel Verileri Koruma Kurulu'))).toBe(true);
    for (const k of r.kazuist) expect(k.body + k.headers).not.toContain(KEY);
    // Without filters the body stays as before: no filters key at all.
    const plain = await run('KVKK m.11', [SON]);
    expect(JSON.parse(plain.kazuist[0]!.body)).not.toHaveProperty('filters');
  });

  it('a question carrying the internal separator stops at prepare (400), before any provider call', async () => {
    const r = await run('KVKK m.11 \u0000\u0001 sahte pasaj', [GOOD, SON]).catch((e: unknown) => e);
    expect(r).toMatchObject({ name: 'ByokError', kind: 'hazirlik', status: 400 });
  });

  it('abstains when the model gives no supported sentence, and still charges nothing', async () => {
    const r = await run('KVKK m.11', ['{"t":"yetersiz","neden":"x"}', SON]);
    expect(r.emitted.map((e) => e.t)).toEqual(['kaynaklar', 'uyari', 'uyari', 'cekimser', 'son']);
    expect(r.emitted.find((e) => e.t === 'cekimser')).toMatchObject({ neden: 'kaynak_yetersiz' });
    expect(r.emitted.at(-1)).toMatchObject({ creditsCharged: 0 });
  });
});

describe('production configuration (review.md P8.5)', () => {
  const prod = { NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32) };

  it('refuses in-process counters and nonces in production instead of falling back silently', () => {
    expect(() => buildSummaryDeps({}, prod)).toThrow(GatewayConfigError);
    expect(() => buildSummaryDeps({}, { NODE_ENV: 'production' })).toThrow(/VALKEY_URL, BETTER_AUTH_SECRET/);
    expect(() =>
      buildSummaryDeps({ counters: new MemoryCounterStore(), nonces: new MemoryNonceStore() }, prod),
    ).not.toThrow();
    expect(() => buildSummaryDeps({}, { NODE_ENV: 'development' })).not.toThrow();
  });

  it('the summary endpoints answer 503 rather than run on memory counters', async () => {
    setSummaryDeps(undefined);
    const env = process.env as Record<string, string | undefined>;
    const before = env.NODE_ENV;
    env.NODE_ENV = 'production';
    delete env.VALKEY_URL;
    try {
      const res = await post(preparePost, '/v1/answers/prepare', {
        q: 'KVKK m.11',
        provider: 'openrouter',
        model: 'a/b',
      });
      expect(res.status).toBe(503);
    } finally {
      env.NODE_ENV = before;
    }
  });
});

describe('platform AI configuration (BYOK-only launch, plan 8.7/2)', () => {
  const KEY = 'yer-tutucu-anahtar';
  const memory = {
    counters: new MemoryCounterStore(),
    nonces: new MemoryNonceStore(),
    sink: () => undefined,
  };

  it('a platform key alone is not enough: platform AI needs AI_DAILY_BUDGET_TRY as well', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(buildSummaryDeps(memory, {}).platformAcik).toBe(false);
      expect(buildSummaryDeps(memory, { OPENROUTER_API_KEY: KEY }).platformAcik).toBe(false);
      expect(
        buildSummaryDeps(memory, { OPENROUTER_API_KEY: KEY, AI_DAILY_BUDGET_TRY: '500' }).platformAcik,
      ).toBe(true);
      expect(
        buildSummaryDeps(memory, { ANTHROPIC_API_KEY: KEY, AI_DAILY_BUDGET_TRY: '500' }).platformAcik,
      ).toBe(true);
      // The warning names the missing variable and never carries a value.
      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('"name":"AI_DAILY_BUDGET_TRY"');
      expect(logged).not.toContain(KEY);
    } finally {
      warn.mockRestore();
    }
  });

  it('an invalid AI_USD_TRY_RATE falls back to 50 and is reported by name only', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => buildSummaryDeps(memory, { AI_USD_TRY_RATE: '49,37' })).not.toThrow();
      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('"error":"invalid_env","name":"AI_USD_TRY_RATE"');
      expect(logged).not.toContain('49,37');
    } finally {
      warn.mockRestore();
    }
  });

  it('platform mode answers 503 with the BYOK pointer before searching or counting anything', async () => {
    const off = buildSummaryDeps({ ...memory, ledger, signingSecret: 'x'.repeat(48), hashSecret: 'h' }, {});
    expect(off.platformAcik).toBe(false);
    setSummaryDeps(off);
    const res = await post(answersPost, '/v1/answers', {
      q: 'KVKK m.11',
      mode: 'platform',
      depth: 'standart',
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { message: string }).message).toBe(byokMetin.ozet.platformKapali);
    expect(prompts).toHaveLength(0);
    expect(ledger.reservations.size).toBe(0);
  });

  it('crossing AI_DAILY_BUDGET_TRY logs one JSON line (amounts and day only) and calls the extra hook', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hooked: string[] = [];
    try {
      const d = buildSummaryDeps(
        {
          ...memory,
          adapters: {
            anthropic: fake('anthropic'),
            openrouter: fake('openrouter'),
            openai: fake('openai'),
            gemini: fake('gemini'),
          },
          ledger: new FakeLedger(),
          hashSecret: 'h',
          onPlatformCap: (a) => hooked.push(a.trigger),
        },
        { OPENROUTER_API_KEY: KEY, AI_DAILY_BUDGET_TRY: '0.0001' },
      );
      expect(d.platformAcik).toBe(true);
      lines = () => ['bir cevap'];
      const r = await d.gateway.complete({
        requestId: 'yazma:kisaltma:1',
        operation: 'kisaltma_oneri',
        mode: 'platform',
        userId,
        userHash: 'u',
        ipHash: 'i',
        credits: 0,
        free: false,
        system: 'Sabit talimat.',
        prompt: 'TBK',
      });
      expect(r.cost.costTl).toBeGreaterThan(0.0001);
      expect(hooked).toEqual(['crossed']);
      const logged = err.mock.calls.map((c) => String(c[0]));
      const line = JSON.parse(logged.find((l) => l.includes('platform_tavan'))!) as Record<string, unknown>;
      expect(line).toMatchObject({
        at: 'gecit',
        level: 'error',
        event: 'platform_tavan',
        trigger: 'crossed',
      });
      expect(line.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(line.capTl).toBe(0.0001);
      expect(Object.keys(line).sort()).toEqual([
        'at',
        'capTl',
        'day',
        'event',
        'level',
        'spendTl',
        'trigger',
      ]);
      for (const l of logged) for (const secret of [KEY, 'TBK', 'Sabit']) expect(l).not.toContain(secret);
    } finally {
      err.mockRestore();
    }
  });

  it('platformCapAlert rounds the spend to kuruş', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      platformCapAlert({
        kind: 'platform_tavan',
        trigger: 'refused',
        day: '2026-11-15',
        spendTl: 1000.456,
        capTl: 1000,
      });
      expect(JSON.parse(String(err.mock.calls[0]?.[0]))).toMatchObject({
        spendTl: 1000.46,
        trigger: 'refused',
      });
    } finally {
      err.mockRestore();
    }
  });
});
