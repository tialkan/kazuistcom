import { randomUUID } from 'node:crypto';
import {
  clientIp,
  MemoryRateLimitStore,
  RateLimiter,
  ValkeyRateLimitStore,
  type RateRule,
} from '@/server/auth/rate-limit';
import { sharedValkey } from '@/server/deps';

/** Rate rules of the casuist endpoints (plan 5.6/3). Search is public, so it is limited per client IP. */
export const casuistRules = {
  searchIp: { name: 'search-ip', limit: 60, windowSec: 60 },
  recordIp: { name: 'record-ip', limit: 120, windowSec: 60 },
  normIp: { name: 'norm-ip', limit: 120, windowSec: 60 },
  answerUser: { name: 'answer-user', limit: 20, windowSec: 600 },
  prepareUser: { name: 'prepare-user', limit: 20, windowSec: 600 },
  verifyUser: { name: 'verify-user', limit: 60, windowSec: 600 },
  libraryUser: { name: 'library-user', limit: 120, windowSec: 60 },
  exportUser: { name: 'library-export-user', limit: 20, windowSec: 600 },
} satisfies Record<string, RateRule>;

let limiter: RateLimiter | undefined;

export function casuistLimiter(): RateLimiter {
  if (!limiter) {
    const url = process.env.VALKEY_URL;
    limiter = new RateLimiter(url ? new ValkeyRateLimitStore(sharedValkey(url)) : new MemoryRateLimitStore());
  }
  return limiter;
}

/** Tests reset the limiter between cases. */
export function resetCasuistLimiter(next?: RateLimiter): void {
  limiter = next;
}

/**
 * Per IP decision. Without a readable client IP every such caller shares one bucket with a tenth of the limit
 * (same rule as the identity endpoints, D-05).
 */
export async function checkIpRate(req: Request, rule: RateRule) {
  const ip = clientIp(req.headers, Number(process.env.TRUSTED_PROXY_COUNT ?? '1'));
  if (ip !== 'unknown') return casuistLimiter().check(rule, ip);
  return casuistLimiter().check(
    {
      name: `${rule.name}-unknown`,
      limit: Math.max(1, Math.floor(rule.limit / 10)),
      windowSec: rule.windowSec,
    },
    'unknown',
  );
}

/** Structured error log: class, path and request id only. Queries and bodies are never logged. */
export function logError(req: Request, err: unknown): string {
  const requestId = randomUUID();
  console.error(
    JSON.stringify({
      at: 'casuist',
      level: 'error',
      method: req.method,
      path: new URL(req.url).pathname,
      error: err instanceof Error ? err.name : 'Unknown',
      requestId,
    }),
  );
  return requestId;
}
