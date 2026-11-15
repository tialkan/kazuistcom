import type { ByokProvider } from '@kazuist/contracts';
import {
  ProviderError,
  type AdapterCallOptions,
  type CompletionRequest,
  type FetchLike,
  type ProviderAdapter,
  type StreamChunk,
} from '../types.ts';
import { withDeadline } from './deadline.ts';
import { readSse, safeJson } from './sse.ts';

/*
 * Endpoints and stream formats, verified against official docs on 2026-10-19 (packages/ai-gateway/SAGLAYICILAR.md):
 * - Anthropic Messages API, SSE events message_start, content_block_delta (text_delta), message_delta (usage).
 *   Browser calls need header anthropic-dangerous-direct-browser-access: true.
 * - OpenRouter and OpenAI chat completions, SSE `data:` chunks with choices[0].delta.content, `[DONE]` terminator,
 *   usage in the last chunk when stream_options.include_usage is set.
 * - Gemini v1beta models/{model}:streamGenerateContent?alt=sse, header x-goog-api-key.
 * Every call runs under a deadline (adapters/deadline.ts, review.md P8.5).
 */
type AnyRecord = Record<string, unknown>;
const rec = (v: unknown): AnyRecord => (v && typeof v === 'object' ? (v as AnyRecord) : {});
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Signal and first byte hook of the running deadline. */
interface CallContext {
  signal: AbortSignal;
  arrived: () => void;
}

async function post(
  fetchFn: FetchLike,
  provider: ByokProvider,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  ctx: CallContext,
): Promise<Response> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: ctx.signal,
  });
  ctx.arrived();
  if (!res.ok) {
    // Body may echo the prompt; it is discarded, never logged.
    await res.body?.cancel().catch(() => undefined);
    throw new ProviderError(provider, res.status);
  }
  return res;
}

export interface AdapterConfig {
  fetch?: FetchLike;
  baseUrl?: string;
  /** Set when the adapter runs in a browser (BYOK istemci). */
  browser?: boolean;
}

const defaultFetch: FetchLike = (i, init) => fetch(i, init);

export function anthropicAdapter(cfg: AdapterConfig = {}): ProviderAdapter {
  const f = cfg.fetch ?? defaultFetch;
  const base = cfg.baseUrl ?? 'https://api.anthropic.com';
  async function* run(
    req: CompletionRequest,
    opt: AdapterCallOptions,
    ctx: CallContext,
  ): AsyncGenerator<StreamChunk> {
    const headers: Record<string, string> = {
      'x-api-key': opt.apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (cfg.browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    const res = await post(
      f,
      'anthropic',
      `${base}/v1/messages`,
      headers,
      {
        model: req.model,
        max_tokens: req.maxOutputTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        stream: true,
        // Effort is an optional input on the Messages API; `none` and `minimal` do not exist there.
        ...(req.reasoningEffort === 'low' ? { output_config: { effort: 'low' } } : {}),
      },
      ctx,
    );
    let input = 0;
    let output = 0;
    for await (const ev of readSse(res.body)) {
      const d = rec(safeJson(ev.data));
      if (d.type === 'message_start') {
        const u = rec(rec(d.message).usage);
        input = num(u.input_tokens);
        output = num(u.output_tokens);
      } else if (d.type === 'content_block_delta') {
        const delta = rec(d.delta);
        if (delta.type === 'text_delta' && typeof delta.text === 'string')
          yield { type: 'text', text: delta.text };
      } else if (d.type === 'message_delta') {
        output = num(rec(d.usage).output_tokens) || output;
      } else if (d.type === 'error') {
        throw new ProviderError('anthropic', 500);
      }
    }
    yield { type: 'usage', inputTokens: input, outputTokens: output };
  }
  return {
    provider: 'anthropic',
    stream: (req, opt) =>
      withDeadline('anthropic', opt, (signal, arrived) => run(req, opt, { signal, arrived })),
  };
}

function chatCompletionsAdapter(
  provider: 'openai' | 'openrouter',
  defaultBase: string,
  cfg: AdapterConfig,
): ProviderAdapter {
  const f = cfg.fetch ?? defaultFetch;
  const base = cfg.baseUrl ?? defaultBase;
  async function* run(
    req: CompletionRequest,
    opt: AdapterCallOptions,
    ctx: CallContext,
  ): AsyncGenerator<StreamChunk> {
    const body: AnyRecord = {
      model: req.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
    };
    const headers: Record<string, string> = { authorization: `Bearer ${opt.apiKey}` };
    if (provider === 'openrouter') {
      body.max_tokens = req.maxOutputTokens;
      // plan 8.4/3: always deny data collection; zdr only on request.
      body.provider = { data_collection: 'deny', ...(opt.openRouter?.zdr ? { zdr: true } : {}) };
      if (req.reasoningEffort) body.reasoning = { effort: req.reasoningEffort };
      headers['x-title'] = 'Kazuist';
      headers['http-referer'] = 'https://kazuist.com';
    } else {
      body.max_completion_tokens = req.maxOutputTokens;
    }
    const res = await post(f, provider, `${base}/chat/completions`, headers, body, ctx);
    let input = 0;
    let output = 0;
    for await (const ev of readSse(res.body)) {
      if (ev.data === '[DONE]') break;
      const d = rec(safeJson(ev.data));
      if (d.error) throw new ProviderError(provider, 500);
      const choices = Array.isArray(d.choices) ? d.choices : [];
      const content = rec(rec(choices[0]).delta).content;
      if (typeof content === 'string' && content) yield { type: 'text', text: content };
      if (d.usage) {
        const u = rec(d.usage);
        input = num(u.prompt_tokens);
        output = num(u.completion_tokens);
      }
    }
    yield { type: 'usage', inputTokens: input, outputTokens: output };
  }
  return {
    provider,
    stream: (req, opt) =>
      withDeadline(provider, opt, (signal, arrived) => run(req, opt, { signal, arrived })),
  };
}

export const openAiAdapter = (cfg: AdapterConfig = {}): ProviderAdapter =>
  chatCompletionsAdapter('openai', 'https://api.openai.com/v1', cfg);

export const openRouterAdapter = (cfg: AdapterConfig = {}): ProviderAdapter =>
  chatCompletionsAdapter('openrouter', 'https://openrouter.ai/api/v1', cfg);

export function geminiAdapter(cfg: AdapterConfig = {}): ProviderAdapter {
  const f = cfg.fetch ?? defaultFetch;
  const base = cfg.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  async function* run(
    req: CompletionRequest,
    opt: AdapterCallOptions,
    ctx: CallContext,
  ): AsyncGenerator<StreamChunk> {
    const model = encodeURIComponent(req.model.replace(/^models\//, ''));
    const res = await post(
      f,
      'gemini',
      `${base}/models/${model}:streamGenerateContent?alt=sse`,
      { 'x-goog-api-key': opt.apiKey },
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: { maxOutputTokens: req.maxOutputTokens },
      },
      ctx,
    );
    let input = 0;
    let output = 0;
    for await (const ev of readSse(res.body)) {
      const d = rec(safeJson(ev.data));
      const cands = Array.isArray(d.candidates) ? d.candidates : [];
      const parts = rec(rec(cands[0]).content).parts;
      if (Array.isArray(parts))
        for (const p of parts) {
          const t = rec(p).text;
          if (typeof t === 'string' && t && rec(p).thought !== true) yield { type: 'text', text: t };
        }
      if (d.usageMetadata) {
        const u = rec(d.usageMetadata);
        input = num(u.promptTokenCount);
        output = num(u.candidatesTokenCount) + num(u.thoughtsTokenCount);
      }
    }
    yield { type: 'usage', inputTokens: input, outputTokens: output };
  }
  return {
    provider: 'gemini',
    stream: (req, opt) =>
      withDeadline('gemini', opt, (signal, arrived) => run(req, opt, { signal, arrived })),
  };
}

export function createAdapters(cfg: AdapterConfig = {}): Record<ByokProvider, ProviderAdapter> {
  return {
    anthropic: anthropicAdapter(cfg),
    openrouter: openRouterAdapter(cfg),
    openai: openAiAdapter(cfg),
    gemini: geminiAdapter(cfg),
  };
}

/**
 * Browser call (CORS) support per official docs, checked 2026-10-19. A provider marked false
 * must run in byok_aktarma mode (plan 8.2). OpenRouter rechecked 2026-11-15: the preflight for
 * POST /api/v1/chat/completions answers Access-Control-Allow-Origin: * and allows Authorization,
 * Content-Type, HTTP-Referer and X-Title.
 */
export const browserCallSupport: Record<ByokProvider, boolean> = {
  anthropic: true,
  openrouter: true,
  openai: true,
  gemini: true,
};
