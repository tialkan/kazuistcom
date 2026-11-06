import {
  fromFlatWeights,
  httpEmbedder,
  sqlBackend,
  type Embedder,
  type SearchBackend,
  type SearchDeps,
} from '@kazuist/casuist';
import { sharedPool } from '@/server/deps';

/**
 * Process wide search dependencies (plan 7.2). The corpus source is chosen once:
 * - KAZUIST_ARAMA_KAYNAGI=fikstur: the fixture corpus of packages/casuist (tests, local development, screenshots);
 * - otherwise PostgreSQL over DATABASE_URL (records, chunks).
 * Production never falls back to the fixture: without a database the search answers 503.
 * The vector leg runs only when the embedding service is configured (KAZUIST_EMBED_URL, KAZUIST_EMBED_MODEL);
 * without it the leg is reported as degraded and the search stays full text plus identity.
 */
export type CorpusSource = 'fikstur' | 'veritabani';

export class SearchUnavailable extends Error {
  override name = 'SearchUnavailable';
}

type Env = Record<string, string | undefined>;

export function corpusSource(env: Env = process.env): CorpusSource {
  if (env.KAZUIST_ARAMA_KAYNAGI === 'fikstur') {
    if (env.NODE_ENV === 'production' && env.KAZUIST_FIKSTUR_URETIMDE !== '1')
      throw new SearchUnavailable('fixture corpus is not allowed in production');
    return 'fikstur';
  }
  if (!env.DATABASE_URL) {
    if (env.NODE_ENV === 'production') throw new SearchUnavailable('no corpus database');
    return 'fikstur';
  }
  return 'veritabani';
}

export function embedderFromEnv(env: Env = process.env): Embedder | null {
  const url = env.KAZUIST_EMBED_URL;
  const model = env.KAZUIST_EMBED_MODEL;
  if (!url || !model) return null;
  return httpEmbedder({ url, model, dimensions: Number(env.KAZUIST_EMBED_DIM ?? '1024') || 1024 });
}

/** Ranking weights override from the admin panel's flat map (JSON in KAZUIST_ARAMA_AGIRLIK until the panel). */
function weightsFromEnv(env: Env) {
  if (!env.KAZUIST_ARAMA_AGIRLIK) return undefined;
  try {
    const parsed = JSON.parse(env.KAZUIST_ARAMA_AGIRLIK) as Record<string, number>;
    return fromFlatWeights(parsed);
  } catch {
    return undefined;
  }
}

let cached: { key: string; deps: Promise<SearchDeps & { source: CorpusSource }> } | undefined;
let override: (SearchDeps & { source: CorpusSource }) | undefined;

/** Tests replace the dependencies. */
export function setSearchDeps(deps: (SearchDeps & { source: CorpusSource }) | undefined): void {
  override = deps;
}

export async function getSearchDeps(env: Env = process.env): Promise<SearchDeps & { source: CorpusSource }> {
  if (override) return override;
  const source = corpusSource(env);
  const key = `${source}|${env.DATABASE_URL ?? ''}|${env.KAZUIST_EMBED_URL ?? ''}`;
  if (!cached || cached.key !== key) {
    const weights = weightsFromEnv(env);
    const build = async (): Promise<SearchDeps & { source: CorpusSource }> => {
      if (source === 'fikstur') {
        // Loaded lazily so the 200 KB fixture never enters a production bundle path that does not use it.
        const { fixtureSearchDeps } = await import('@kazuist/casuist/fixture');
        return { ...(await fixtureSearchDeps()), source, ...(weights ? { weights } : {}) };
      }
      const backend: SearchBackend = sqlBackend(sharedPool(env.DATABASE_URL ?? ''));
      const embedder = embedderFromEnv(env);
      return {
        backend,
        source,
        ...(embedder ? { embedder } : {}),
        ...(weights ? { weights } : {}),
        minSimilarity: Number(env.KAZUIST_EMBED_ESIK ?? '0') || 0,
      };
    };
    cached = { key, deps: build() };
  }
  return cached.deps;
}
