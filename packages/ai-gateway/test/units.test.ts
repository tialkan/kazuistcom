import { describe, expect, it } from 'vitest';
import {
  BudgetError,
  BudgetGuard,
  FakeLedger,
  MemoryCounterStore,
  MemoryNonceStore,
  NonceGoneError,
  ProviderSwitch,
  ROUTES,
  SignatureError,
  HAIKU_TIER_THRESHOLD,
  geminiPolicy,
  isValidIban,
  isValidLuhn,
  isValidTckn,
  parseJsonLines,
  prepareBundle,
  restore,
  scrub,
  verifyBundle,
} from '../src/index.ts';

async function* gen(parts: string[]) {
  for (const p of parts) yield p;
}
async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('JSON Lines parser', () => {
  it('splits deltas across chunk boundaries and validates with the contracts schema', async () => {
    const items = await collect(
      parseJsonLines(
        gen([
          '```jsonl\n{"t":"cumle","metin":"A","kayn',
          'aklar":["K1"],"alinti":{"K1":"yeterince uzun alıntı"}}\n',
          'bozuk satir\n{"t":"cumle","metin":"B","kaynaklar":[]}\n',
          '{"t":"son"}\n{"t":"cumle","metin":"sonra"}',
        ]),
      ),
    );
    expect(items.map((i) => (i.ok ? i.line.t : i.reason))).toEqual([
      'cumle',
      'gecersiz_satir',
      'gecersiz_satir',
      'son',
    ]);
  });
  it('accepts a final line without newline', async () => {
    const items = await collect(parseJsonLines(gen(['{"t":"yetersiz","neden":"x"}'])));
    expect(items).toEqual([{ ok: true, line: { t: 'yetersiz', neden: 'x' } }]);
  });
});

describe('PII scrubber', () => {
  it('validates checksums', () => {
    expect(isValidTckn('10000000146')).toBe(true);
    expect(isValidTckn('10000000147')).toBe(false);
    expect(isValidTckn('01234567890')).toBe(false);
    expect(isValidIban('TR33 0006 1005 1978 6457 8413 26')).toBe(true);
    expect(isValidIban('TR33 0006 1005 1978 6457 8413 27')).toBe(false);
    expect(isValidLuhn('4111 1111 1111 1111')).toBe(true);
    expect(isValidLuhn('4111 1111 1111 1112')).toBe(false);
  });

  it('masks structured identifiers and names, and restores them', async () => {
    const text =
      'Ahmet Yılmaz (TCKN 10000000146) IBAN TR33 0006 1005 1978 6457 8413 26, kart 4111 1111 1111 1111, ' +
      'tel 0532 123 45 67, ahmet.yilmaz@ornek.com.tr, plaka 34 ABC 123. Ahmet Yılmaz itiraz etti.';
    const ner = {
      find: (t: string) =>
        [...t.matchAll(/Ahmet Yılmaz/g)].map((m) => ({
          start: m.index,
          end: m.index + 'Ahmet Yılmaz'.length,
        })),
    };
    const r = await scrub(text, ner);
    expect(r.text).toBe(
      '[KİŞİ-1] (TCKN [KİMLİK NO-1]) IBAN [IBAN-1], kart [KART-1], tel [TELEFON-1], [E-POSTA-1], plaka [PLAKA-1]. [KİŞİ-1] itiraz etti.',
    );
    for (const secret of ['10000000146', 'TR33', '4111', '0532', '@', 'Ahmet', '34 ABC'])
      expect(r.text).not.toContain(secret);
    expect(restore(r.text, r.mapping)).toBe(text);
    expect(r.counts.kisi).toBe(2);
  });

  it('leaves invalid checksums, case numbers and dates untouched', async () => {
    const t =
      'E. 2023/1234 K. 2024/56 sayılı karar 12.03.2024 tarihinde; numara 10000000147; Kanun m. 11/1-c.';
    expect((await scrub(t)).text).toBe(t);
  });
});

describe('BYOK nonce protocol', () => {
  const secret = 'test-secret-not-real';
  const input = {
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    system: 's',
    prompt: 'p',
    sourceIds: ['K1'],
  };

  it('verifies once, then returns 410 on reuse', async () => {
    const store = new MemoryNonceStore();
    const b = await prepareBundle(store, secret, input);
    expect(b.nonce.length).toBeGreaterThanOrEqual(16);
    await expect(verifyBundle(store, secret, b.nonce, b.signature)).resolves.toMatchObject({ prompt: 'p' });
    const err = await verifyBundle(store, secret, b.nonce, b.signature).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NonceGoneError);
    expect((err as NonceGoneError).status).toBe(410);
  });

  it('expires after 10 minutes', async () => {
    let t = Date.parse('2026-10-19T10:00:00Z');
    const store = new MemoryNonceStore(() => t);
    const b = await prepareBundle(store, secret, input, new Date(t));
    t += 10 * 60 * 1000 + 1;
    await expect(verifyBundle(store, secret, b.nonce, b.signature, new Date(t))).rejects.toBeInstanceOf(
      NonceGoneError,
    );
  });

  it('rejects a forged signature and still burns the nonce', async () => {
    const store = new MemoryNonceStore();
    const b = await prepareBundle(store, secret, input);
    await expect(verifyBundle(store, 'other', b.nonce, b.signature)).rejects.toBeInstanceOf(SignatureError);
    await expect(verifyBundle(store, secret, b.nonce, b.signature)).rejects.toBeInstanceOf(NonceGoneError);
  });
});

describe('budget guard', () => {
  const day = () => new Date('2026-10-19T12:00:00Z');
  it('caps daily user credits at 500', async () => {
    const g = new BudgetGuard(new MemoryCounterStore(), undefined, day);
    (await g.admit({ userHash: 'u', ipHash: 'i', credits: 480, free: false })).release();
    (await g.admit({ userHash: 'u', ipHash: 'i', credits: 20, free: false })).release();
    await expect(g.admit({ userHash: 'u', ipHash: 'i', credits: 1, free: false })).rejects.toMatchObject({
      reason: 'kullanici_gunluk_tavan',
    });
  });
  it('limits free uses per IP', async () => {
    const g = new BudgetGuard(
      new MemoryCounterStore(),
      { userDailyCredits: 500, ipDailyFreeUses: 2, maxConcurrentStreamsPerUser: 9, platformDailyTlCap: 100 },
      day,
    );
    for (const u of ['a', 'b'])
      (await g.admit({ userHash: u, ipHash: 'ip', credits: 0, free: true })).release();
    await expect(g.admit({ userHash: 'c', ipHash: 'ip', credits: 0, free: true })).rejects.toMatchObject({
      reason: 'ip_ucretsiz_tavan',
    });
    (await g.admit({ userHash: 'c', ipHash: 'ip2', credits: 0, free: true })).release();
  });
  it('allows at most 2 concurrent streams per user, freeing slots on release', async () => {
    const g = new BudgetGuard(new MemoryCounterStore(), undefined, day);
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => g.admit({ userHash: 'u', ipHash: 'i', credits: 1, free: false })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const rej = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rej.reason as BudgetError).reason).toBe('eszamanli_akis');
    (results[0] as PromiseFulfilledResult<{ release(): void }>).value.release();
    await expect(g.admit({ userHash: 'u', ipHash: 'i', credits: 1, free: false })).resolves.toBeDefined();
  });
  it('stops free use when the platform TL cap is reached, paid use continues', async () => {
    const alerts: string[] = [];
    const g = new BudgetGuard(
      new MemoryCounterStore(),
      {
        ...{ userDailyCredits: 500, ipDailyFreeUses: 10, maxConcurrentStreamsPerUser: 2 },
        platformDailyTlCap: 5,
      },
      day,
      (k) => alerts.push(k),
    );
    await g.recordSpendTl(5);
    await expect(g.admit({ userHash: 'u', ipHash: 'i', credits: 0, free: true })).rejects.toMatchObject({
      reason: 'platform_tavan_ucretsiz_durdu',
    });
    expect(alerts).toEqual(['platform_tavan']);
    (await g.admit({ userHash: 'u', ipHash: 'i', credits: 2, free: false })).release();
  });
  it('kill switch removes a provider from candidates', () => {
    const s = new ProviderSwitch(['anthropic', 'openrouter']);
    s.disable('anthropic');
    expect(s.candidates()).toEqual(['openrouter']);
  });
});

describe('routing, gemini and ledger fake', () => {
  it('keeps every route below the Haiku 100k tier threshold', () => {
    for (const r of Object.values(ROUTES))
      expect(r.maxInputTokens + r.maxOutputTokens).toBeLessThan(HAIKU_TIER_THRESHOLD);
    expect(ROUTES.ozet).toMatchObject({
      model: 'claude-haiku-5-5',
      maxInputTokens: 12_000,
      maxOutputTokens: 400,
    });
    expect(ROUTES.derin_ozet.model).toBe('claude-sonnet-5-5');
  });
  it('closes sensitive content on Gemini free tier unless opted in; unknown counts as free', () => {
    expect(geminiPolicy('bilinmiyor', 'yayimlanmamis_taslak').allowed).toBe(false);
    expect(geminiPolicy('ucretsiz', 'kampus_dosyasi', true)).toMatchObject({ allowed: true, warn: true });
    expect(geminiPolicy('ucretsiz', 'kamu_kaynak')).toMatchObject({ allowed: true, warn: true });
    expect(geminiPolicy('ucretli', 'kampus_dosyasi')).toEqual({ allowed: true, warn: false });
  });
  it('reservation is idempotent and expires after 5 minutes', async () => {
    let t = 0;
    const l = new FakeLedger(() => t);
    const a = await l.reserve({ userId: 'u', credits: 2, idempotencyKey: 'k' });
    expect((await l.reserve({ userId: 'u', credits: 2, idempotencyKey: 'k' })).reservationId).toBe(
      a.reservationId,
    );
    t = 5 * 60 * 1000 + 1;
    await expect(l.consume(a.reservationId, 2)).rejects.toThrow('expired');
  });
});
