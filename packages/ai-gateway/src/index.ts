/** Provider independent AI gateway (plan 8). Owner: yz-gecidi agent. */
import type { ByokProvider } from '@kazuist/contracts';

export type GatewayMode = 'platform' | 'byok_istemci' | 'byok_aktarma';

export interface CompletionRequest {
  provider: ByokProvider;
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
}

/** Adapters stream raw text; content is never logged (plan 8.8). */
export interface ProviderAdapter {
  readonly provider: ByokProvider;
  stream(request: CompletionRequest, signal?: AbortSignal): AsyncIterable<string>;
}
