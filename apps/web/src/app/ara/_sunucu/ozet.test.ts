/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeLedger,
  MemoryCounterStore,
  MemoryNonceStore,
  ProviderError,
  type ProviderAdapter,
  type StreamChunk,
} from '@kazuist/ai-gateway';
import type { AnswerEvent, ByokProvider } from '@kazuist/contracts';
import { api, createHarness, signUp, type Harness } from '@/server/auth/__tests__/harness';
import { eq } from 'drizzle-orm';
import { schema } from '@/server/auth/db';
import { MemoryRateLimitStore, RateLimiter } from '@/server/auth/rate-limit';
import { byokOzet, kazuistDeps } from '../_bilesen/byok.ts';
import { setSearchDeps } from './baglam.ts';
import { buildSummaryDeps, GatewayConfigError, setSummaryDeps, type SummaryDeps } from './gecit.ts';
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
const saved = { ...process.env };

function fake(provider: ByokProvider): ProviderAdapter {
  return {
    provider,
    async *stream(req): AsyncIterable<StreamChunk> {
      prompts.push(req.prompt);
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

  async function run(q: string, modelLines: string[]) {
    const w = wiring(modelLines);
    const emitted: AnswerEvent[] = [];
    const result = await byokOzet({
      q,
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

  it('masks personal identifiers before the provider sees them; a separator in the question shifts nothing', async () => {
    const r = await run('KVKK m.11 \u0000\u0001 T.C. 10000000146 numaralı başvurum, tel 0532 123 45 67', [
      GOOD,
      SON,
    ]);
    const sent = JSON.parse(r.provider[0]!.body) as { messages: { content: string }[] };
    const userText = sent.messages[1]!.content;
    expect(userText).not.toMatch(/10000000146|0532 123 45 67/);
    expect(userText).toContain('[KİMLİK NO-1]');
    expect(r.emitted.find((e) => e.t === 'cumle')).toBeTruthy();
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
