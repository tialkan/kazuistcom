import {
  AnswerRequest,
  formatSseEvent,
  PrepareRequest,
  VerifyRequest,
  type AnswerEvent,
  type ModelLine,
} from '@kazuist/contracts';
import {
  answerEvents,
  createLineValidator,
  DEEP_SELECTION,
  loadPromptPassages,
  search,
  selectPassages,
  sourceChips,
  STANDARD_SELECTION,
  type AnswerTexts,
  type PromptPassage,
} from '@kazuist/casuist';
import {
  assertSourcesMatch,
  BudgetError,
  buildSourcedPrompt,
  BundleSubjectError,
  GatewayError,
  neutralize,
  NonceGoneError,
  passageDigest,
  prepareBundle,
  ROUTES,
  scrubSourced,
  SignatureError,
  SourceMismatchError,
  SOURCED_SUMMARY_SYSTEM,
  verifyBundle,
  type GatewayEvent,
} from '@kazuist/ai-gateway';
import byok from '@kazuist/i18n/tr/byok.json' with { type: 'json' };
import ozet from '@kazuist/i18n/tr/ozet.json' with { type: 'json' };
import { and, desc, eq, gt, isNotNull } from 'drizzle-orm';
import { withAuth, type Principal } from '@/server/auth/guard';
import { apiError, json, noStore, rateLimited, readJson } from '@/server/auth/http';
import { schema } from '@/server/auth/db';
import type { AuthContext } from '@/server/auth/context';
import { clientIp } from '@/server/auth/rate-limit';
import { getSearchDeps, SearchUnavailable } from './baglam.ts';
import {
  GatewayConfigError,
  getSummaryDeps,
  istanbulDay,
  keyedHash,
  maskQuery,
  nameRecognizer,
  type SummaryDeps,
} from './gecit.ts';
import { casuistRules, logError } from './hiz.ts';

/** plan 4.2 and 4.4: daily free sourced summaries and credits per summary. */
export const FREE_PER_DAY = { standart: 2, eduDogrulanmis: 5 } as const;
export const CREDITS = { standart: 2, derin: 60 } as const;

export const answerTexts: AnswerTexts = {
  sabitFr19: ozet.sabitUyari,
  sabitFr20: ozet.danismanlikUyarisi,
  cekimser: ozet.cekimser,
  uyari: {
    veri_gunu: ozet.uyari.veriGunu,
    guncellik: ozet.uyari.guncellik,
    destekleyici_kaynak: ozet.uyari.destekleyici,
  },
};

/** Edu verification is valid for a year (plan 10.1/3). */
async function eduVerified(ctx: AuthContext, userId: string, now: Date): Promise<boolean> {
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
  const rows = await ctx.db
    .select({ id: schema.eduVerifications.id })
    .from(schema.eduVerifications)
    .where(
      and(
        eq(schema.eduVerifications.userId, userId),
        isNotNull(schema.eduVerifications.verifiedAt),
        gt(schema.eduVerifications.verifiedAt, yearAgo),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Latest decision of the user for a consent kind (content/hukuki acik-riza madde 3: yz_aktarim). */
async function consentGranted(ctx: AuthContext, userId: string, kind: 'yz_aktarim'): Promise<boolean> {
  const [row] = await ctx.db
    .select({ granted: schema.consents.granted })
    .from(schema.consents)
    .where(and(eq(schema.consents.userId, userId), eq(schema.consents.kind, kind)))
    .orderBy(desc(schema.consents.createdAt))
    .limit(1);
  return row?.granted === true;
}

const IDEMPOTENCY = /^[\x21-\x7e]{8,100}$/;

/*
 * A question with C0 controls (other than tab and line breaks) or DEL is refused by the contract schema itself
 * (QuestionText in AnswerRequest.q and PrepareRequest.q, v1.6, ADR-0038), so it cannot carry the gateway's internal
 * part separator. The gateway still strips them before masking (scrubParts) as defence in depth.
 */

/** Selection per route; a bundle names its route so verify rebuilds passages at the same size. */
const SELECTION = { ozet: STANDARD_SELECTION, derin_ozet: DEEP_SELECTION } as const;

function sse(events: AsyncIterable<AnswerEvent>, onClose: () => void): Response {
  const enc = new TextEncoder();
  const it = events[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await it.next();
        if (next.done) {
          controller.close();
          onClose();
        } else controller.enqueue(enc.encode(formatSseEvent(next.value)));
      } catch (e) {
        // A failure after the stream started ends it without details (wt.65).
        controller.error(e instanceof Error ? new Error(e.name) : new Error('stream'));
        onClose();
      }
    },
    async cancel() {
      await it.return?.(undefined);
      onClose();
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      ...noStore,
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  });
}

async function* noLines(): AsyncGenerator<ModelLine | null> {}

/** Missing production configuration (review.md P8.5) answers 503; gecit.ts already logged which variable. */
function summaryDeps(): SummaryDeps | Response {
  try {
    return getSummaryDeps();
  } catch (e) {
    if (e instanceof GatewayConfigError) return apiError('unavailable', ozet.hata.saglayiciYok);
    throw e;
  }
}

function gatewayErrorResponse(e: unknown): Response | null {
  if (e instanceof BudgetError) return rateLimited(60);
  if (e instanceof GatewayError) {
    if (e.code === 'insufficient_credits') return apiError('insufficient_credits', ozet.hata.krediYetersiz);
    if (e.code === 'unavailable') return apiError('unavailable', ozet.hata.saglayiciYok);
    if (e.code === 'forbidden') return apiError('forbidden', ozet.hata.saglayiciIzinYok);
    if (e.code === 'payload_too_large') return apiError('payload_too_large');
    if (e.code === 'conflict') return apiError('conflict');
    return apiError('bad_request');
  }
  return null;
}

/** POST /v1/answers (SSE): retrieval, Ek D prompt through the gateway, line validation, abstention. */
async function answer(req: Request, p: Principal, ctx: AuthContext): Promise<Response> {
  const key = req.headers.get('idempotency-key') ?? '';
  if (!IDEMPOTENCY.test(key)) return apiError('bad_request');
  const parsed = AnswerRequest.safeParse(await readJson(req));
  if (!parsed.success) return apiError('bad_request');
  const body = parsed.data;
  if (body.mode === 'byok_aktarma') {
    if (!body.byok) return apiError('bad_request');
    if (!(await consentGranted(ctx, p.userId, 'yz_aktarim')))
      return apiError('forbidden', ozet.hata.izinGerekli);
  }

  const deps = summaryDeps();
  if (deps instanceof Response) return deps;
  // Platform AI not configured (no platform key or no AI_DAILY_BUDGET_TRY): nothing is searched, counted or sent;
  // the message points to BYOK, which /ara offers up front in this state anyway.
  if (body.mode === 'platform' && !deps.platformAcik)
    return apiError('unavailable', byok.ozet.platformKapali);
  const now = deps.now();
  const requestId = `ozet:${keyedHash(deps.hashSecret, 'istek', `${p.userId}:${key}`)}`;
  const userHash = keyedHash(deps.hashSecret, 'kullanici', p.userId);
  const ip = clientIp(req.headers, ctx.config.trustedProxies);
  const ipHash = keyedHash(deps.hashSecret, 'ip', ip);

  let searchDeps;
  try {
    searchDeps = await getSearchDeps();
  } catch (e) {
    if (e instanceof SearchUnavailable) return apiError('unavailable');
    throw e;
  }
  const result = await search(
    { q: body.q, ...(body.filters ?? {}), page: 1, pageSize: 50 },
    { ...searchDeps, mask: maskQuery },
  );
  const passages: PromptPassage[] = await selectPassages(
    result.items,
    result.query,
    searchDeps.backend,
    body.depth === 'derin' ? DEEP_SELECTION : STANDARD_SELECTION,
  );

  // No sources: abstain at once; nothing is sent to a provider and nothing is charged (plan 7.4/4, 4.5/3).
  if (!passages.length) {
    return sse(
      answerEvents({ requestId, passages, lines: noLines(), texts: answerTexts, now, settle: () => 0 }),
      () => undefined,
    );
  }

  const platform = body.mode === 'platform';
  let free = false;
  let freeKey: string | null = null;
  // The free allowance needs a verified e-mail (kimlik, Principal.emailVerified); unverified accounts can still
  // sign in and use credits or BYOK.
  if (platform && body.depth === 'standart' && p.emailVerified) {
    const limit = (await eduVerified(ctx, p.userId, now))
      ? FREE_PER_DAY.eduDogrulanmis
      : FREE_PER_DAY.standart;
    freeKey = `ozet:ucretsiz:${userHash}:${istanbulDay(now)}`;
    if ((await deps.counters.get(freeKey)) < limit) {
      free = true;
      await deps.counters.incrBy(freeKey, 1, 2 * 86_400);
    }
  }
  const credits = platform && !free ? CREDITS[body.depth] : 0;
  const refundFree = async (): Promise<void> => {
    if (free && freeKey) await deps.counters.incrBy(freeKey, -1, 2 * 86_400);
  };

  deps.ledger.setAccepted(requestId, 0);
  const run = deps.gateway.run({
    requestId,
    operation: body.depth === 'derin' ? 'derin_ozet' : 'ozet',
    mode: platform ? 'platform' : 'byok_aktarma',
    userId: p.userId,
    userHash,
    ipHash,
    credits,
    free,
    question: body.q,
    passages: passages.map((x) => ({
      id: x.id,
      type: x.type,
      authority: x.authority,
      status: x.status,
      date: x.date,
      dataDay: x.dataDay,
      text: x.text,
    })),
    ...(body.byok
      ? { byok: { provider: body.byok.provider, model: body.byok.model, apiKey: body.byok.apiKey } }
      : {}),
    signal: req.signal,
  });
  const it = run[Symbol.asyncIterator]();
  let first: IteratorResult<GatewayEvent>;
  try {
    // Admission, reservation and the first provider byte happen here, so their errors are plain HTTP errors.
    first = await it.next();
  } catch (e) {
    deps.ledger.forget(requestId);
    await refundFree();
    const r = gatewayErrorResponse(e);
    if (r) return r;
    throw e;
  }

  /**
   * Closes the gateway run if it is still open: frees the user's stream slot and releases the credit hold. A client
   * that went away used to leave the run suspended, so the slot leaked and two cancelled summaries blocked the user
   * until a restart. A no-op once the run finished.
   */
  const closeRun = async (): Promise<void> => {
    await Promise.resolve(it.return?.(undefined)).catch(() => undefined);
  };

  let charged = 0;
  async function* lines(): AsyncGenerator<ModelLine | null> {
    try {
      for (let cur = first; !cur.done; cur = await it.next()) {
        const ev = cur.value;
        if (ev.t === 'satir') yield ev.line;
        else if (ev.t === 'gecersiz') yield null;
        else charged = ev.cost.creditsCharged;
      }
    } catch (e) {
      // Technical errors are free (plan 4.5/3): the gateway released the hold; the free use is returned too.
      await refundFree();
      throw e;
    } finally {
      await closeRun();
    }
  }
  const events = answerEvents({
    requestId,
    passages,
    lines: lines(),
    texts: answerTexts,
    now,
    onProgress: (s) => deps.ledger.setAccepted(requestId, s.accepted),
    settle: async (s) => {
      if (s.abstained) await refundFree();
      return s.abstained ? 0 : Math.min(charged, credits);
    },
  });
  // A cancel before the first model line never starts lines(), so the stream end closes the run as well; the charge
  // decision (setAccepted) is forgotten only after the run settled.
  return sse(events, () => {
    void closeRun().finally(() => deps.ledger.forget(requestId));
  });
}

export const answersPost = withAuth({ rate: casuistRules.answerUser }, async (req, p, ctx) => {
  try {
    return await answer(req, p, ctx);
  } catch (e) {
    return apiError('internal', undefined, {}, logError(req, e));
  }
});

/** POST /v1/answers/prepare (plan 8.1, BYOK istemci): masked question and passages in a signed bundle. */
export const preparePost = withAuth({ rate: casuistRules.prepareUser }, async (req, p) => {
  const parsed = PrepareRequest.safeParse(await readJson(req));
  if (!parsed.success) return apiError('bad_request');
  const deps = summaryDeps();
  if (deps instanceof Response) return deps;
  if (!deps.signingSecret) return apiError('unavailable');
  let searchDeps;
  try {
    searchDeps = await getSearchDeps();
  } catch (e) {
    if (e instanceof SearchUnavailable) return apiError('unavailable');
    throw e;
  }
  // The same filters as POST /v1/answers (PrepareRequest.filters, v1.6), so both modes pick from the same records.
  const result = await search(
    { q: parsed.data.q, ...(parsed.data.filters ?? {}), page: 1, pageSize: 50 },
    { ...searchDeps, mask: maskQuery },
  );
  const operation = parsed.data.depth === 'derin' ? 'derin_ozet' : 'ozet';
  const passages = await selectPassages(result.items, result.query, searchDeps.backend, SELECTION[operation]);
  // Same scrub as the gateway: one label space, passages first, so verify can rebuild the passages alone.
  const scrubbed = await scrubSourced(
    parsed.data.q,
    passages.map((x) => x.text),
    nameRecognizer,
  );
  scrubbed.mapping.clear();
  const masked = passages.map((x, i) => ({
    id: x.id,
    type: x.type,
    authority: x.authority,
    status: x.status,
    date: x.date,
    dataDay: x.dataDay,
    text: scrubbed.passages[i] ?? '',
  }));
  const prompt = buildSourcedPrompt(scrubbed.question, masked);
  // What the model sees inside each <kaynak> block: the masked text with tags neutralised.
  const seen = masked.map((x) => neutralize(x.text));
  const route = ROUTES[operation];
  const bundle = await prepareBundle(
    deps.nonces,
    deps.signingSecret,
    {
      subject: keyedHash(deps.hashSecret, 'kullanici', p.userId),
      operation,
      provider: parsed.data.provider,
      model: parsed.data.model,
      system: SOURCED_SUMMARY_SYSTEM,
      prompt,
      sources: passages.map((x, i) => ({
        id: x.id,
        recordId: x.recordId,
        chunkId: x.chunkId,
        sha256: passageDigest(seen[i] ?? ''),
      })),
    },
    deps.now(),
  );
  // The browser validates against exactly what the model sees.
  return json({
    nonce: bundle.nonce,
    expiresAt: bundle.expiresAt,
    signature: bundle.signature,
    system: bundle.system,
    prompt: bundle.prompt,
    sources: sourceChips(passages),
    passages: Object.fromEntries(masked.map((x, i) => [x.id, seen[i] ?? ''])),
    limits: { maxInputTokens: route.maxInputTokens, maxOutputTokens: route.maxOutputTokens },
  });
});

/**
 * POST /v1/answers/verify (plan 8.1): server side re-validation of BYOK client lines; the nonce is single use and
 * bound to the user it was issued to. The passages are reloaded from the store by (record, chunk), rebuilt and
 * masked like prepare did, and must match the signed digests; the prompt text is never parsed for passages.
 */
export const verifyPost = withAuth({ rate: casuistRules.verifyUser }, async (req, p) => {
  const parsed = VerifyRequest.safeParse(await readJson(req));
  if (!parsed.success) return apiError('bad_request');
  const deps = summaryDeps();
  if (deps instanceof Response) return deps;
  if (!deps.signingSecret) return apiError('unavailable');
  let bundle;
  try {
    bundle = await verifyBundle(
      deps.nonces,
      deps.signingSecret,
      parsed.data.nonce,
      parsed.data.signature,
      keyedHash(deps.hashSecret, 'kullanici', p.userId),
      deps.now(),
    );
  } catch (e) {
    if (e instanceof NonceGoneError) return apiError('nonce_expired');
    if (e instanceof SignatureError) return apiError('bad_request');
    if (e instanceof BundleSubjectError) return apiError('forbidden');
    throw e;
  }
  const selection =
    bundle.operation === 'ozet' || bundle.operation === 'derin_ozet' ? SELECTION[bundle.operation] : null;
  if (!selection) return apiError('bad_request');
  let searchDeps;
  try {
    searchDeps = await getSearchDeps();
  } catch (e) {
    if (e instanceof SearchUnavailable) return apiError('unavailable');
    throw e;
  }
  const loaded = await loadPromptPassages(searchDeps.backend, bundle.sources, selection);
  const scrubbed = await scrubSourced(
    '',
    loaded.map((x) => x.text),
    nameRecognizer,
  );
  scrubbed.mapping.clear();
  const rebuilt = loaded.map((x, i) => ({
    id: x.id,
    recordId: x.recordId,
    chunkId: x.chunkId,
    text: neutralize(scrubbed.passages[i] ?? ''),
  }));
  try {
    assertSourcesMatch(bundle.sources, rebuilt);
  } catch (e) {
    // A source changed, was hidden or removed after prepare: nothing can be checked against what the model saw.
    if (e instanceof SourceMismatchError) return apiError('conflict');
    throw e;
  }
  const v = createLineValidator(
    loaded.map((x, i) => ({
      id: x.id,
      text: rebuilt[i]?.text ?? '',
      authority: x.authority,
      status: x.status,
      fetchedAt: x.fetchedAt,
    })),
    { now: deps.now() },
  );
  const results = [];
  for (const [index, line] of parsed.data.lines.entries()) {
    const verdict = await v.check(line);
    results.push({ index, ok: verdict.ok, reason: verdict.ok ? null : verdict.reason });
  }
  // Saving verified summaries needs a table that the contract does not have yet (docs/istekler); savedId stays null.
  return json({ results, abstained: v.summary().abstained, savedId: null });
});
