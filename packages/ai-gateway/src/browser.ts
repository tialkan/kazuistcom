/**
 * Browser build of the gateway (plan 8.1, BYOK istemci; import as @kazuist/ai-gateway/browser). It holds no
 * Kazuist secret, no Node built-ins and no platform keys: the user's key goes from Web Storage straight to the
 * provider. test/browser.test.ts walks every import of this file and enforces that.
 */
export { openRouterAdapter, browserCallSupport, type AdapterConfig } from './adapters/index.ts';
export {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  ProviderError,
  ProviderTimeoutError,
  type FetchLike,
  type ProviderAdapter,
  type ReasoningEffort,
  type StreamChunk,
} from './types.ts';
export { parseJsonLines, type JsonlItem } from './jsonl.ts';
export { scrub, scrubParts } from './pii.ts';
export { ROUTES } from './routing.ts';
export * from './byok/settings.ts';
export * from './byok/client.ts';
