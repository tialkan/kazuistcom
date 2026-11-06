import { SearchQuery } from '@kazuist/contracts';
import ara from '@kazuist/i18n/tr/ara.json' with { type: 'json' };
import {
  parseQuery,
  resolveNorms,
  search,
  toApiRecord,
  toNormRef,
  toSearchResponse,
  type SearchResult,
} from '@kazuist/casuist';
import { z } from 'zod';
import { apiError, json, rateLimited } from '@/server/auth/http';
import { getSearchDeps, SearchUnavailable } from './baglam.ts';
import { casuistRules, checkIpRate, logError } from './hiz.ts';

/**
 * Search history decision (docs/istekler/mimar-yonlendirme-casuist-kampus-seo.md madde 7): search queries are not
 * stored and not linked to an account; they are not logged either. Only the response leaves the server.
 */

type Handler = (req: Request, params: Record<string, string>) => Promise<Response>;

function guarded(rule: (typeof casuistRules)[keyof typeof casuistRules], handler: Handler) {
  return async (req: Request, route?: { params?: Promise<Record<string, string>> }): Promise<Response> => {
    const d = await checkIpRate(req, rule);
    if (!d.ok) return rateLimited(d.retryAfterSec);
    try {
      return await handler(req, (await route?.params) ?? {});
    } catch (err) {
      if (err instanceof SearchUnavailable) return apiError('unavailable', ara.hata.kullanilamaz);
      return apiError('internal', undefined, {}, logError(req, err));
    }
  };
}

const query = (req: Request): Record<string, string> => Object.fromEntries(new URL(req.url).searchParams);

/** Runs a search for server components and the API alike. */
export async function runSearch(input: SearchQuery): Promise<SearchResult> {
  const deps = await getSearchDeps();
  return search(input, deps);
}

/** GET /v1/search (Ek C.1). */
export const searchGet = guarded(casuistRules.searchIp, async (req) => {
  const parsed = SearchQuery.safeParse(query(req));
  if (!parsed.success) return apiError('bad_request');
  return json(toSearchResponse(await runSearch(parsed.data)));
});

const Id = z.uuid();

/** GET /v1/records/:id: servable (masked) text only; hidden or unmasked records are 404. */
export const recordGet = guarded(casuistRules.recordIp, async (_req, params) => {
  const id = Id.safeParse(params.id);
  if (!id.success) return apiError('not_found');
  const deps = await getSearchDeps();
  const [record] = await deps.backend.records([id.data]);
  if (!record) return apiError('not_found');
  return json(toApiRecord(record));
});

const NormQuery = z.strictObject({ ref: z.string().min(1).max(200) });

/** GET /v1/norms/resolve?ref=: resolved references with the article record when the corpus has it. */
export const normsGet = guarded(casuistRules.normIp, async (req) => {
  const parsed = NormQuery.safeParse(query(req));
  if (!parsed.success) return apiError('bad_request');
  const norms = resolveNorms(parsed.data.ref);
  const deps = await getSearchDeps();
  const out = await Promise.all(
    norms.map(async (n) => {
      const q = { ...parseQuery(''), norms: [n] };
      const [hit] = await deps.backend.identity(q, {}, 1);
      return { ...toNormRef(n), recordId: hit?.id ?? null };
    }),
  );
  return json(out);
});
