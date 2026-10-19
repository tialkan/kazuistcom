import type { ByokProvider } from '@kazuist/contracts';

export type GatewayMode = 'platform' | 'byok_istemci' | 'byok_aktarma';

/** Operation kinds routed by plan 8.6. */
export type Operation =
  | 'ozet'
  | 'derin_ozet'
  | 'kural_cikarma'
  | 'kampus_ozet'
  | 'atif_cikarma'
  | 'kart_editor'
  | 'kart_akademisyen';

export interface CompletionRequest {
  provider: ByokProvider;
  model: string;
  /** Fixed system instruction; never derived from user or source text. */
  system: string;
  /** Already scrubbed user prompt. */
  prompt: string;
  maxOutputTokens: number;
}

export interface OpenRouterOptions {
  /** plan 8.4/3: "gizlilik oncelikli" adds provider.zdr = true. */
  zdr?: boolean;
}

export type StreamChunk =
  { type: 'text'; text: string } | { type: 'usage'; inputTokens: number; outputTokens: number };

export interface AdapterCallOptions {
  apiKey: string;
  signal?: AbortSignal;
  openRouter?: OpenRouterOptions;
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
