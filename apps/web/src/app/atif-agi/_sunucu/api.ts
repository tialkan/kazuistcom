import { z } from 'zod';
import { checkIpRate, logError } from '@/app/ara/_sunucu/hiz';
import { apiError, json, rateLimited } from '@/server/auth/http';
import type { RateRule } from '@/server/auth/rate-limit';
import { FiltreSemasi, type AgFiltresi, type AtifAgi } from '../_alan/tipler.ts';
import { atifKaynagi, KaynakYok } from './kaynak.ts';

/**
 * GET /v1/citation-network and GET /v1/records/:id/network (contract getCitationNetwork, getRecordNetwork).
 * Public, rate limited per client IP, strict zod validation. Queries are filters only and carry no personal data;
 * nothing is logged except the error class, path and request id.
 */
const kurallar = {
  ag: { name: 'citation-network-ip', limit: 60, windowSec: 60 },
  kayit: { name: 'record-network-ip', limit: 120, windowSec: 60 },
} satisfies Record<string, RateRule>;

type Handler = (req: Request, params: Record<string, string>) => Promise<Response>;

function korunan(rule: RateRule, handler: Handler) {
  return async (req: Request, route?: { params?: Promise<Record<string, string>> }): Promise<Response> => {
    const d = await checkIpRate(req, rule);
    if (!d.ok) return rateLimited(d.retryAfterSec);
    try {
      return await handler(req, (await route?.params) ?? {});
    } catch (err) {
      if (err instanceof KaynakYok) return apiError('unavailable');
      return apiError('internal', undefined, {}, logError(req, err));
    }
  };
}

const onbellek = { 'Cache-Control': 'public, max-age=60' };

/** Query string to filter; a repeated key or an unknown key is a 400. */
export function filtreOku(url: URL): { ok: true; filtre: AgFiltresi } | { ok: false } {
  const ham: Record<string, string> = {};
  for (const k of new Set(url.searchParams.keys())) {
    const v = url.searchParams.getAll(k);
    if (v.length !== 1) return { ok: false };
    if (v[0] !== '') ham[k] = v[0] ?? ''; // an empty form field means no filter
  }
  const p = FiltreSemasi.safeParse(ham);
  return p.success ? { ok: true, filtre: p.data } : { ok: false };
}

export async function agiGetir(filtre: AgFiltresi): Promise<AtifAgi> {
  return atifKaynagi().ag(filtre);
}

export const citationNetworkGet = korunan(kurallar.ag, async (req) => {
  const f = filtreOku(new URL(req.url));
  if (!f.ok) return apiError('bad_request');
  return json(await agiGetir(f.filtre), 200, onbellek);
});

const Id = z.uuid();

export const recordNetworkGet = korunan(kurallar.kayit, async (_req, params) => {
  const id = Id.safeParse(params.id);
  if (!id.success) return apiError('not_found');
  const ag = await atifKaynagi().kayitAgi(id.data);
  if (!ag) return apiError('not_found');
  return json(ag, 200, onbellek);
});
