/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { describe, expect, it } from 'vitest';
import {
  BudgetError,
  BudgetGuard,
  BundleSubjectError,
  DEFAULT_BUDGET,
  SourceMismatchError,
  assertSourcesMatch,
  passageDigest,
  type BudgetConfig,
  type PlatformCapAlert,
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
  const sha = passageDigest('K1 metni');
  const input = {
    subject: 'kullanici-a',
    operation: 'ozet',
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    system: 's',
    prompt: 'p',
    sources: [{ id: 'K1', recordId: 'r1', chunkId: 'c1', sha256: sha }],
  };

  it('verifies once, then returns 410 on reuse', async () => {
    const store = new MemoryNonceStore();
    const b = await prepareBundle(store, secret, input);
    expect(b.nonce.length).toBeGreaterThanOrEqual(16);
    await expect(verifyBundle(store, secret, b.nonce, b.signature, 'kullanici-a')).resolves.toMatchObject({
      prompt: 'p',
      subject: 'kullanici-a',
      sources: input.sources,
    });
    const err = await verifyBundle(store, secret, b.nonce, b.signature, 'kullanici-a').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(NonceGoneError);
    expect((err as NonceGoneError).status).toBe(410);
  });

  it('expires after 10 minutes', async () => {
    let t = Date.parse('2026-10-19T10:00:00Z');
    const store = new MemoryNonceStore(() => t);
    const b = await prepareBundle(store, secret, input, new Date(t));
    t += 10 * 60 * 1000 + 1;
    await expect(
      verifyBundle(store, secret, b.nonce, b.signature, 'kullanici-a', new Date(t)),
    ).rejects.toBeInstanceOf(NonceGoneError);
  });

  it('rejects a forged signature and still burns the nonce', async () => {
    const store = new MemoryNonceStore();
    const b = await prepareBundle(store, secret, input);
    await expect(verifyBundle(store, 'other', b.nonce, b.signature, 'kullanici-a')).rejects.toBeInstanceOf(
      SignatureError,
    );
    await expect(verifyBundle(store, secret, b.nonce, b.signature, 'kullanici-a')).rejects.toBeInstanceOf(
      NonceGoneError,
    );
  });

  it('is bound to the user it was issued to: another user gets 403 and the nonce is gone', async () => {
    const store = new MemoryNonceStore();
    const b = await prepareBundle(store, secret, input);
    const err = await verifyBundle(store, secret, b.nonce, b.signature, 'kullanici-b').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BundleSubjectError);
    expect((err as BundleSubjectError).status).toBe(403);
    await expect(verifyBundle(store, secret, b.nonce, b.signature, 'kullanici-a')).rejects.toBeInstanceOf(
      NonceGoneError,
    );
  });

  it('signs the user, the route and the source list: changing any of them in the store breaks it', async () => {
    const tampers: ((p: Record<string, unknown>) => Record<string, unknown>)[] = [
      (p) => ({ ...p, subject: 'kullanici-b' }),
      (p) => ({ ...p, sources: [{ id: 'K1', recordId: 'r1', chunkId: 'c2', sha256: sha }] }),
      (p) => ({
        ...p,
        sources: [{ id: 'K1', recordId: 'r1', chunkId: 'c1', sha256: passageDigest('uydurma') }],
      }),
      (p) => ({ ...p, operation: 'derin_ozet' }),
    ];
    for (const tamper of tampers) {
      const store = new MemoryNonceStore();
      const b = await prepareBundle(store, secret, input);
      const key = `byok:nonce:${b.nonce}`;
      const changed = tamper(JSON.parse((await store.getDel(key))!) as Record<string, unknown>);
      await store.setNx(key, JSON.stringify(changed), 600);
      await expect(
        verifyBundle(store, secret, b.nonce, b.signature, String(changed.subject)),
      ).rejects.toBeInstanceOf(SignatureError);
    }
  });

  it('rejects a payload of the old format (sourceIds, no subject)', async () => {
    const store = new MemoryNonceStore();
    const b = await prepareBundle(store, secret, input);
    const key = `byok:nonce:${b.nonce}`;
    await store.getDel(key);
    const old = {
      nonce: b.nonce,
      expiresAt: b.expiresAt,
      provider: 'a',
      model: 'm',
      system: 's',
      prompt: 'p',
    };
    await store.setNx(key, JSON.stringify({ ...old, sourceIds: ['K1'] }), 600);
    await expect(verifyBundle(store, secret, b.nonce, b.signature, 'kullanici-a')).rejects.toBeInstanceOf(
      SignatureError,
    );
  });

  it('assertSourcesMatch accepts the same passages and refuses a changed, missing or reordered one', () => {
    const sources = [
      { id: 'K1', recordId: 'r1', chunkId: 'c1', sha256: passageDigest('bir') },
      { id: 'K2', recordId: 'r2', chunkId: 'c2', sha256: passageDigest('iki') },
    ];
    const one = { id: 'K1', recordId: 'r1', chunkId: 'c1', text: 'bir' };
    const two = { id: 'K2', recordId: 'r2', chunkId: 'c2', text: 'iki' };
    expect(() => assertSourcesMatch(sources, [one, two])).not.toThrow();
    for (const rebuilt of [
      [one, { ...two, text: 'iki (değişti)' }],
      [one],
      [two, one],
      [one, { ...two, chunkId: 'c9' }],
    ])
      expect(() => assertSourcesMatch(sources, rebuilt)).toThrow(SourceMismatchError);
  });
});

describe('budget guard', () => {
  const day = () => new Date('2026-10-19T12:00:00Z');
  const cfg = (over: Partial<BudgetConfig> = {}): BudgetConfig => ({ ...DEFAULT_BUDGET, ...over });
  const paid = (credits: number, u = 'u', ip = 'i') => ({
    userHash: u,
    ipHash: ip,
    platform: true,
    credits,
    free: false,
  });
  const freeUse = (u = 'u', ip = 'i') => ({
    userHash: u,
    ipHash: ip,
    platform: true,
    credits: 0,
    free: true,
  });
  const byok = (u = 'u', ip = 'i') => ({ userHash: u, ipHash: ip, platform: false, credits: 0, free: false });

  it('caps daily user credits at 500', async () => {
    const g = new BudgetGuard(new MemoryCounterStore(), undefined, day);
    (await g.admit(paid(480))).release();
    (await g.admit(paid(20))).release();
    await expect(g.admit(paid(1))).rejects.toMatchObject({ reason: 'kullanici_gunluk_tavan' });
  });
  it('limits free uses per IP', async () => {
    const g = new BudgetGuard(
      new MemoryCounterStore(),
      cfg({ ipDailyFreeUses: 2, maxConcurrentStreamsPerUser: 9, platformDailyTlCap: 100 }),
      day,
    );
    for (const u of ['a', 'b']) (await g.admit(freeUse(u, 'ip'))).release();
    await expect(g.admit(freeUse('c', 'ip'))).rejects.toMatchObject({ reason: 'ip_ucretsiz_tavan' });
    (await g.admit(freeUse('c', 'ip2'))).release();
  });
  it('limits platform credits per IP across accounts (promo credits on many accounts)', async () => {
    const store = new MemoryCounterStore();
    const g = new BudgetGuard(store, cfg({ ipDailyCredits: 100 }), day);
    for (const u of ['a', 'b']) (await g.admit(paid(50, u, 'ip'))).release();
    await expect(g.admit(paid(2, 'c', 'ip'))).rejects.toMatchObject({ reason: 'ip_kredi_tavan' });
    // The refused call counted nothing for user c.
    expect(await store.get('credits:user:c:2026-10-19')).toBe(0);
    (await g.admit(paid(2, 'c', 'ip2'))).release();
    // BYOK spends no platform credits and is not limited by it.
    (await g.admit(byok('d', 'ip'))).release();
  });
  it('a refused call leaves no counter behind; rollback undoes every counter', async () => {
    const store = new MemoryCounterStore();
    const g = new BudgetGuard(store, cfg({ userDailyCredits: 10 }), day);
    await expect(g.admit(paid(11))).rejects.toMatchObject({ reason: 'kullanici_gunluk_tavan' });
    expect(await store.get('credits:ip:i:2026-10-19')).toBe(0);
    const a = await g.admit(paid(4));
    expect(await store.get('credits:ip:i:2026-10-19')).toBe(4);
    await a.rollback();
    expect(await store.get('credits:ip:i:2026-10-19')).toBe(0);
    expect(await store.get('credits:user:u:2026-10-19')).toBe(0);
    const f = await g.admit(freeUse());
    await f.rollback();
    expect(await store.get('free:ip:i:2026-10-19')).toBe(0);
  });
  it('allows at most 2 concurrent streams per user, freeing slots on release', async () => {
    const g = new BudgetGuard(new MemoryCounterStore(), undefined, day);
    const results = await Promise.allSettled([1, 2, 3].map(() => g.admit(paid(1))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const rej = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rej.reason as BudgetError).reason).toBe('eszamanli_akis');
    (results[0] as PromiseFulfilledResult<{ release(): void }>).value.release();
    await expect(g.admit(paid(1))).resolves.toBeDefined();
  });
  it('the platform TL cap stops every platform call (free and credit); BYOK continues', async () => {
    const alerts: PlatformCapAlert[] = [];
    const g = new BudgetGuard(new MemoryCounterStore(), cfg({ platformDailyTlCap: 5 }), day, (a) =>
      alerts.push(a),
    );
    (await g.admit(paid(2))).release();
    await g.recordSpendTl(5);
    await expect(g.admit(freeUse())).rejects.toMatchObject({ reason: 'platform_tavan_ucretsiz_durdu' });
    await expect(g.admit(paid(2))).rejects.toMatchObject({ reason: 'platform_tavan_kredili_durdu' });
    // A platform call that holds no credit is still paid by the platform.
    await expect(g.admit(paid(0))).rejects.toMatchObject({ reason: 'platform_tavan_kredili_durdu' });
    // plan 8.7/2: the crossing call alerts once, the refusals once per day in this process, not per request.
    expect(alerts).toEqual([
      { kind: 'platform_tavan', trigger: 'crossed', day: '2026-10-19', spendTl: 5, capTl: 5 },
      { kind: 'platform_tavan', trigger: 'refused', day: '2026-10-19', spendTl: 5, capTl: 5 },
    ]);
    (await g.admit(byok())).release();
  });
  it('the cap alert fires only for the spend that crosses the ceiling, and again on a new day', async () => {
    const store = new MemoryCounterStore();
    let now = new Date('2026-10-19T10:00:00Z');
    const alerts: PlatformCapAlert[] = [];
    const g = new BudgetGuard(
      store,
      cfg({ platformDailyTlCap: 10 }),
      () => now,
      (a) => alerts.push(a),
    );
    await g.recordSpendTl(4);
    await g.recordSpendTl(4);
    expect(alerts).toEqual([]);
    await g.recordSpendTl(3);
    await g.recordSpendTl(3);
    expect(alerts.map((a) => [a.trigger, a.day, a.spendTl])).toEqual([['crossed', '2026-10-19', 11]]);
    // Two instances share the counter store: the second one never sees a crossing on the same day.
    const other = new BudgetGuard(
      store,
      cfg({ platformDailyTlCap: 10 }),
      () => now,
      (a) => alerts.push(a),
    );
    await other.recordSpendTl(1);
    expect(alerts).toHaveLength(1);
    now = new Date('2026-10-20T10:00:00Z');
    await g.recordSpendTl(12);
    expect(alerts.map((a) => [a.trigger, a.day])).toEqual([
      ['crossed', '2026-10-19'],
      ['crossed', '2026-10-20'],
    ]);
  });
  it('a throwing alert hook breaks neither admission nor spend recording', async () => {
    const g = new BudgetGuard(new MemoryCounterStore(), cfg({ platformDailyTlCap: 1 }), day, () => {
      throw new Error('hook');
    });
    await expect(g.recordSpendTl(2)).resolves.toBeUndefined();
    await expect(g.admit(paid(1))).rejects.toMatchObject({ reason: 'platform_tavan_kredili_durdu' });
  });
  it('a BYOK call never counts platform credits or free uses, even if the caller passes them', async () => {
    const store = new MemoryCounterStore();
    const g = new BudgetGuard(store, cfg({ platformDailyTlCap: 0 }), day);
    (await g.admit({ userHash: 'u', ipHash: 'i', platform: false, credits: 60, free: true })).release();
    expect(await store.get('credits:user:u:2026-10-19')).toBe(0);
    expect(await store.get('free:ip:i:2026-10-19')).toBe(0);
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
  it('accepts Gemini BYOK only with a paid billing declaration (kararlar 2026-10-22)', () => {
    const closed = { allowed: false, reason: 'ucretli_faturalandirma_beyani_yok' };
    expect(geminiPolicy('bilinmiyor')).toEqual(closed);
    expect(geminiPolicy('ucretsiz')).toEqual(closed);
    expect(geminiPolicy('ucretli')).toEqual({ allowed: true });
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
