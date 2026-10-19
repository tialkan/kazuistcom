import type { ByokProvider } from '@kazuist/contracts';
import {
  ProviderError,
  type CompletionRequest,
  type ProviderAdapter,
  type StreamChunk,
} from '../src/index.ts';
import type { Passage } from '../src/prompt.ts';

export interface FakeCall {
  request: CompletionRequest;
  apiKey: string;
}

export function fakeAdapter(
  provider: ByokProvider,
  chunks: string[] | (() => string[]),
  opts: { failStatus?: number; usage?: [number, number]; gate?: Promise<void> } = {},
): ProviderAdapter & { calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  return {
    provider,
    calls,
    async *stream(request, o): AsyncIterable<StreamChunk> {
      calls.push({ request, apiKey: o.apiKey });
      if (opts.failStatus) throw new ProviderError(provider, opts.failStatus);
      if (opts.gate) await opts.gate;
      for (const c of typeof chunks === 'function' ? chunks() : chunks) yield { type: 'text', text: c };
      const [i, out] = opts.usage ?? [1000, 100];
      yield { type: 'usage', inputTokens: i, outputTokens: out };
    },
  };
}

export const passage = (id: string, text: string): Passage => ({
  id,
  type: 'karar',
  authority: 'yuksek_emsal',
  status: 'kesinlesti',
  date: '2024-01-10',
  dataDay: '2026-10-18',
  text,
});

export function sseBody(events: string[]): Response {
  const enc = new TextEncoder();
  const text = events.map((e) => `data: ${e}\n\n`).join('');
  // Split into odd sized chunks to exercise buffering.
  const pieces: Uint8Array[] = [];
  const bytes = enc.encode(text);
  for (let i = 0; i < bytes.length; i += 7) pieces.push(bytes.slice(i, i + 7));
  return new Response(
    new ReadableStream({
      start(c) {
        for (const p of pieces) c.enqueue(p);
        c.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}
