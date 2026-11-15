import type { ByokProvider } from '@kazuist/contracts';

export type GatewayMode = 'platform' | 'byok_istemci' | 'byok_aktarma';

/** Operation kinds routed by plan 8.6. */
export type Operation =
  | 'ozet'
  | 'derin_ozet'
  | 'kural_cikarma'
  | 'kisaltma_oneri'
  | 'kampus_ozet'
  | 'atif_cikarma'
  | 'kart_editor'
  | 'kart_akademisyen';

/**
 * Reasoning effort (checked 2026-11-15). OpenRouter `reasoning.effort`
 * (https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) and Anthropic `output_config.effort`
 * (https://platform.claude.com/docs/en/build-with-claude/effort): thinking tokens count against the output
 * limit, so a reasoning model can spend the whole budget before the first JSON line. Only sent for models
 * whose supported efforts are known; Anthropic has no `none` or `minimal`, so only `low` reaches it.
 */
export type ReasoningEffort = 'none' | 'minimal' | 'low';

export interface CompletionRequest {
  provider: ByokProvider;
  model: string;
  /** Fixed system instruction; never derived from user or source text. */
  system: string;
  /** Already scrubbed user prompt. */
  prompt: string;
  maxOutputTokens: number;
  /** OpenRouter (`reasoning.effort`) and Anthropic (`output_config.effort`, `low` only); others ignore it. */
  reasoningEffort?: ReasoningEffort;
}

export interface OpenRouterOptions {
  /** plan 8.4/3: "gizlilik oncelikli" adds provider.zdr = true. */
  zdr?: boolean;
}

export type StreamChunk =
  { type: 'text'; text: string } | { type: 'usage'; inputTokens: number; outputTokens: number };

/** review.md P8.5: every provider call has a deadline. */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 60_000;
/** Time allowed until the provider answers with response headers. */
export const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 20_000;

export interface AdapterCallOptions {
  apiKey: string;
  signal?: AbortSignal;
  openRouter?: OpenRouterOptions;
  /** Overall deadline of the call, stream included. Default DEFAULT_PROVIDER_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Deadline until response headers arrive. Default DEFAULT_FIRST_BYTE_TIMEOUT_MS. */
  firstByteTimeoutMs?: number;
}

/** Adapters stream raw text; content is never logged (plan 8.8). No tools are ever sent (plan 5.6/6). */
export interface ProviderAdapter {
  readonly provider: ByokProvider;
  stream(request: CompletionRequest, options: AdapterCallOptions): AsyncIterable<StreamChunk>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class ProviderError extends Error {
  constructor(
    readonly provider: ByokProvider,
    readonly status: number,
  ) {
    super(`provider ${provider} returned status ${status}`);
    this.name = 'ProviderError';
  }
}

/**
 * The provider missed a deadline: `ilk_bayt` before response headers, `akis` while streaming. Status 504, so
 * platform mode falls back to the next provider when nothing was streamed yet (plan 8.7/3).
 */
export class ProviderTimeoutError extends ProviderError {
  constructor(
    provider: ByokProvider,
    readonly phase: 'ilk_bayt' | 'akis',
  ) {
    super(provider, 504);
    this.message = `provider ${provider} timed out (${phase})`;
    this.name = 'ProviderTimeoutError';
  }
}
