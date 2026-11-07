import { fold } from './normalize.ts';

/** Query or passage embedding provider. Production: the services/worker-py/nlp service on our own server. */
export interface Embedder {
  /** Model identifier stored in chunks.embedding_model; vectors of different models never mix. */
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], kind: 'query' | 'passage'): Promise<number[][]>;
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Character trigram hashing vectors. This is NOT a semantic embedding: it gives the fixture index a second,
 * spelling tolerant leg ("ozel nitelikli" against "özel nitelikli", typos) so the hybrid fusion is exercised
 * end to end without the embedding service. Real retrieval uses the model chosen by eval/embed.
 */
export function trigramEmbedder(dimensions = 256): Embedder {
  const one = (text: string): number[] => {
    const v = new Array<number>(dimensions).fill(0);
    for (const word of fold(text).split(/[^\p{L}\p{N}]+/u)) {
      if (!word) continue;
      const w = ` ${word} `;
      for (let i = 0; i + 3 <= w.length; i++) {
        const h = fnv1a(w.slice(i, i + 3));
        const idx = h % dimensions;
        v[idx] = (v[idx] ?? 0) + ((h >>> 16) & 1 ? 1 : -1);
      }
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  };
  return {
    model: `trigram-hash-${dimensions}`,
    dimensions,
    embed: async (texts) => texts.map(one),
  };
}

/**
 * HTTP client for the embedding service (services/worker-py/nlp). Contract proposed in
 * docs/istekler/casuist-embedding-servisi.md: POST {texts, kind} -> {model, vectors}. The query text is
 * already masked by the caller; nothing is logged here.
 */
export function httpEmbedder(opts: {
  url: string;
  model: string;
  dimensions: number;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}): Embedder {
  const f = opts.fetch ?? ((i: string, init: RequestInit) => fetch(i, init));
  return {
    model: opts.model,
    dimensions: opts.dimensions,
    async embed(texts, kind) {
      const res = await f(opts.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texts, kind }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 800),
      });
      if (!res.ok) throw new Error(`embedding service status ${res.status}`);
      const body = (await res.json()) as { model?: unknown; vectors?: unknown };
      if (body.model !== opts.model || !Array.isArray(body.vectors))
        throw new Error('embedding model mismatch');
      const vectors = body.vectors as unknown[];
      if (
        vectors.length !== texts.length ||
        !vectors.every((v) => Array.isArray(v) && v.length === opts.dimensions)
      )
        throw new Error('embedding shape mismatch');
      return vectors as number[][];
    },
  };
}
