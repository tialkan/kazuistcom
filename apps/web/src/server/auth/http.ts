import { randomUUID } from 'node:crypto';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import type { ErrorCode } from '@kazuist/contracts';

const messages: Partial<Record<ErrorCode, string>> = {
  bad_request: tr.hata.gecersiz,
  unauthorized: tr.hata.girisGerekli,
  forbidden: tr.hata.yetkiYok,
  not_found: tr.hata.bulunamadi,
  rate_limited: tr.hata.cokFazla,
  internal: tr.hata.genel,
};

const statuses: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  insufficient_credits: 402,
  nonce_expired: 410,
  unavailable: 503,
  internal: 500,
};

export const noStore = { 'Cache-Control': 'no-store' } as const;

/** Error body per contract (components.schemas.Error); never includes internals. */
export function apiError(
  code: ErrorCode,
  message?: string,
  headers: Record<string, string> = {},
  requestId: string = randomUUID(),
): Response {
  return Response.json(
    { code, message: message ?? messages[code] ?? tr.hata.genel, requestId },
    { status: statuses[code], headers: { ...noStore, ...headers } },
  );
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...noStore, ...headers } });
}

export function rateLimited(retryAfterSec: number): Response {
  return apiError('rate_limited', undefined, { 'Retry-After': String(retryAfterSec) });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
