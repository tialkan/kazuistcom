import {
  DEFAULT_FIRST_BYTE_TIMEOUT_MS,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  ProviderTimeoutError,
  type AdapterCallOptions,
  type StreamChunk,
} from '../types.ts';
import type { ByokProvider } from '@kazuist/contracts';

/**
 * Deadline for one provider call (review.md P8.5): a first byte timer until the response headers arrive and an
 * overall timer for the whole stream. Either one aborts the request; the caller's own signal still aborts it too.
 * Browser safe: setTimeout and AbortController only.
 */
export interface Deadline {
  signal: AbortSignal;
  /** Stops the first byte timer once the response headers are in. */
  headersArrived(): void;
  /** Which timer fired, or null when none did. */
  timedOut(): 'ilk_bayt' | 'akis' | null;
  dispose(): void;
}

export function createDeadline(
  parent: AbortSignal | undefined,
  totalMs: number,
  firstByteMs: number,
): Deadline {
  const ctl = new AbortController();
  let reason: 'ilk_bayt' | 'akis' | null = null;
  let headers = false;
  const fire = (): void => {
    if (ctl.signal.aborted) return;
    reason = headers ? 'akis' : 'ilk_bayt';
    ctl.abort(new DOMException('provider deadline', 'TimeoutError'));
  };
  const total = setTimeout(fire, totalMs);
  let first: ReturnType<typeof setTimeout> | undefined = setTimeout(fire, Math.min(firstByteMs, totalMs));
  const onParent = (): void => ctl.abort(parent?.reason);
  if (parent?.aborted) ctl.abort(parent.reason);
  else parent?.addEventListener('abort', onParent, { once: true });
  return {
    signal: ctl.signal,
    headersArrived() {
      headers = true;
      if (first !== undefined) clearTimeout(first);
      first = undefined;
    },
    timedOut: () => reason,
    dispose() {
      clearTimeout(total);
      if (first !== undefined) clearTimeout(first);
      parent?.removeEventListener('abort', onParent);
    },
  };
}

/**
 * Runs an adapter body under a deadline and turns a fired timer into ProviderTimeoutError. Errors that are not
 * caused by the deadline (provider status, the caller's abort) pass through unchanged.
 */
export async function* withDeadline(
  provider: ByokProvider,
  opt: AdapterCallOptions,
  body: (signal: AbortSignal, headersArrived: () => void) => AsyncIterable<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  const d = createDeadline(
    opt.signal,
    opt.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    opt.firstByteTimeoutMs ?? DEFAULT_FIRST_BYTE_TIMEOUT_MS,
  );
  try {
    yield* body(d.signal, () => d.headersArrived());
  } catch (e) {
    const phase = d.timedOut();
    if (phase) throw new ProviderTimeoutError(provider, phase);
    throw e;
  } finally {
    d.dispose();
  }
}
