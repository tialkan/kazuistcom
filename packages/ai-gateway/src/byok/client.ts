import { PrepareResponse, VerifyResponse, type ModelLine } from '@kazuist/contracts';
import { openRouterAdapter } from '../adapters/index.ts';
import { parseJsonLines } from '../jsonl.ts';
import { scrub } from '../pii.ts';
import { ROUTES } from '../routing.ts';
import { ProviderError, ProviderTimeoutError, type FetchLike, type ProviderAdapter } from '../types.ts';
import { reasoningEffortFor, type ByokSettings } from './settings.ts';

/**
 * BYOK istemci protocol in the browser (plan 8.1, K-08, ADR-0008):
 * 1. POST /v1/answers/prepare with the question, provider and model. The key is never part of this request.
 *    The server retrieves, masks question and passages (plan 8.5) and returns a signed bundle (nonce, 10 min).
 * 2. The browser checks the masked prompt once more and calls the provider directly with the user's key.
 * 3. Model lines stream back as JSON Lines; the caller validates each with the casuist browser validator.
 * 4. POST /v1/answers/verify re-validates the lines on the server and burns the single use nonce.
 */

export type ByokErrorKind =
  /** prepare or verify answered 401: not signed in. */
  | 'oturum'
  /** prepare answered 429. */
  | 'cok_fazla'
  /** prepare answered 503: signing secret or search not configured. */
  | 'hazirlik_yok'
  /** any other prepare failure or a malformed bundle. */
  | 'hazirlik'
  /** the bundle still holds structural personal data; nothing was sent to the provider. */
  | 'maskesiz_metin'
  /** provider 401 or 403. */
  | 'anahtar_gecersiz'
  /** provider 402: the user's provider balance is empty. */
  | 'saglayici_bakiye'
  /** provider 404: unknown model, or no endpoint that honours data_collection deny (and zdr when chosen). */
  | 'model_yok'
  /** provider 429. */
  | 'saglayici_sinir'
  /** a provider deadline fired. */
  | 'zaman_asimi'
  /** any other provider status. */
  | 'saglayici'
  /** network or CORS failure. */
  | 'baglanti';

/** Carries a kind and a status code only: never the key, the prompt or a provider message. */
export class ByokError extends Error {
  constructor(
    readonly kind: ByokErrorKind,
    readonly status?: number,
  ) {
    super(`byok ${kind}`);
    this.name = 'ByokError';
  }
}

export interface PrepareBody {
  q: string;
  provider: ByokSettings['provider'];
  model: string;
  depth: 'standart' | 'derin';
}

export interface VerifyBody {
  nonce: string;
  signature: string;
  lines: string[];
  save: false;
}

export interface ByokClientDeps {
  /** POST /api/v1/answers/prepare on Kazuist; receives no key. */
  prepare(body: PrepareBody, signal?: AbortSignal): Promise<Response>;
  /** POST /api/v1/answers/verify on Kazuist; without it the nonce simply expires after 10 minutes. */
  verify?(body: VerifyBody, signal?: AbortSignal): Promise<Response>;
  /** Defaults to the OpenRouter adapter in browser mode. */
  adapter?: ProviderAdapter;
  fetch?: FetchLike;
}

export interface ByokRunInput {
  q: string;
  depth?: 'standart' | 'derin';
  settings: ByokSettings;
  signal?: AbortSignal;
}

export type ByokClientEvent =
  | { t: 'hazir'; bundle: PrepareResponse }
  /** null: a line that is not valid Ek D.1 JSON. */
  | { t: 'satir'; line: ModelLine | null }
  /** Server verdict per line index; null when verify was unavailable (display already used the browser check). */
  | { t: 'dogrulama'; results: VerifyResponse['results'] | null };

/**
 * Defence in depth: the server masked question and passages before signing (plan 8.5). The browser runs the
 * structural recognisers over the whole prompt again and refuses to send it if anything is still found.
 */
export async function assertMasked(prompt: string): Promise<void> {
  const r = await scrub(prompt);
  r.mapping.clear();
  if (Object.keys(r.counts).length) throw new ByokError('maskesiz_metin');
}

const isAbort = (e: unknown, signal?: AbortSignal): boolean =>
  Boolean(signal?.aborted) || (e instanceof Error && e.name === 'AbortError');

function prepareKind(status: number): ByokErrorKind {
  if (status === 401) return 'oturum';
  if (status === 429) return 'cok_fazla';
  if (status === 503) return 'hazirlik_yok';
  return 'hazirlik';
}

function providerKind(e: unknown): ByokErrorKind {
  if (e instanceof ProviderTimeoutError) return 'zaman_asimi';
  if (e instanceof ProviderError) {
    if (e.status === 401 || e.status === 403) return 'anahtar_gecersiz';
    if (e.status === 402) return 'saglayici_bakiye';
    if (e.status === 404) return 'model_yok';
    if (e.status === 429) return 'saglayici_sinir';
    if (e.status === 408 || e.status === 504) return 'zaman_asimi';
    return 'saglayici';
  }
  return 'baglanti';
}

export type KeyCheck =
  | {
      ok: true;
      /** OpenRouter account without purchased credits: free models only, with a daily request limit. */
      freeTier: boolean;
      /** The key has its own credit limit; OpenRouter advises keeping keys without one out of client code. */
      limited: boolean;
    }
  | { ok: false; kind: 'anahtar_gecersiz' | 'saglayici' | 'zaman_asimi' | 'baglanti' };

/**
 * Checks a key against GET https://openrouter.ai/api/v1/key (checked 2026-11-15: answers 401 without a valid
 * key, returns data.is_free_tier and data.limit, preflight allows GET with Authorization from any origin). Only
 * the two flags are read; the response is not stored. Called from the browser, so the key stays on the device.
 */
export async function checkOpenRouterKey(
  apiKey: string,
  opts: { fetch?: FetchLike; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<KeyCheck> {
  const f = opts.fetch ?? ((i: string, init: RequestInit) => fetch(i, init));
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, opts.timeoutMs ?? 10_000);
  const onAbort = (): void => ctl.abort(opts.signal?.reason);
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await f('https://openrouter.ai/api/v1/key', {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey.trim()}` },
      signal: ctl.signal,
    });
    if (res.status === 401 || res.status === 403) return { ok: false, kind: 'anahtar_gecersiz' };
    if (!res.ok) return { ok: false, kind: 'saglayici' };
    const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const d = body?.data ?? {};
    return { ok: true, freeTier: d.is_free_tier === true, limited: typeof d.limit === 'number' };
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    return { ok: false, kind: timedOut ? 'zaman_asimi' : 'baglanti' };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/** VerifyRequest limits (contracts): at most 20 lines of at most 4000 characters. */
const VERIFY_MAX_LINES = 20;
const VERIFY_MAX_CHARS = 4000;

export async function* runByokClient(
  input: ByokRunInput,
  deps: ByokClientDeps,
): AsyncGenerator<ByokClientEvent> {
  const depth = input.depth ?? 'standart';
  const s = input.settings;

  let res: Response;
  try {
    res = await deps.prepare({ q: input.q, provider: s.provider, model: s.model, depth }, input.signal);
  } catch (e) {
    if (isAbort(e, input.signal)) throw e;
    throw new ByokError('baglanti');
  }
  if (!res.ok) throw new ByokError(prepareKind(res.status), res.status);
  const parsed = PrepareResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ByokError('hazirlik');
  const bundle = parsed.data;
  yield { t: 'hazir', bundle };
  // No sources: the caller abstains; the provider is never called (plan 7.4/4).
  if (!bundle.sources.length) return;

  await assertMasked(bundle.prompt);

  const route = ROUTES[depth === 'derin' ? 'derin_ozet' : 'ozet'];
  const adapter =
    deps.adapter ?? openRouterAdapter({ browser: true, ...(deps.fetch ? { fetch: deps.fetch } : {}) });
  const effort = reasoningEffortFor(s.model);
  const lines: string[] = [];
  try {
    const stream = adapter.stream(
      {
        provider: s.provider,
        model: s.model,
        system: bundle.system,
        prompt: bundle.prompt,
        maxOutputTokens: bundle.limits.maxOutputTokens,
        ...(effort ? { reasoningEffort: effort } : {}),
      },
      {
        apiKey: s.apiKey,
        timeoutMs: route.timeoutMs,
        openRouter: { zdr: s.zdr },
        ...(input.signal ? { signal: input.signal } : {}),
      },
    );
    const texts = async function* (): AsyncGenerator<string> {
      for await (const c of stream) if (c.type === 'text') yield c.text;
    };
    for await (const item of parseJsonLines(texts())) {
      if (item.ok) {
        lines.push(JSON.stringify(item.line));
        yield { t: 'satir', line: item.line };
      } else yield { t: 'satir', line: null };
    }
  } catch (e) {
    if (isAbort(e, input.signal)) throw e;
    throw new ByokError(providerKind(e), e instanceof ProviderError ? e.status : undefined);
  }

  if (!deps.verify) return;
  let results: VerifyResponse['results'] | null = null;
  try {
    const v = await deps.verify(
      {
        nonce: bundle.nonce,
        signature: bundle.signature,
        // Index i of the verdicts is line i of the stream: an over long line is sent empty (rejected), not dropped.
        lines: lines.slice(0, VERIFY_MAX_LINES).map((l) => (l.length <= VERIFY_MAX_CHARS ? l : '')),
        save: false,
      },
      input.signal,
    );
    if (v.ok) {
      const body = VerifyResponse.safeParse(await v.json().catch(() => null));
      if (body.success) results = body.data.results;
    }
  } catch (e) {
    if (isAbort(e, input.signal)) throw e;
  }
  yield { t: 'dogrulama', results };
}
