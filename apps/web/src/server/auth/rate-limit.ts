/**
 * Fixed window rate limiter for identity endpoints (plan 5.6/3). Counters live in Valkey in
 * production so every web instance shares them; tests use the in-memory store.
 */
export interface RateLimitStore {
  /** Increment `key`; the window starts at the first hit and lasts `windowSec`. */
  hit(key: string, windowSec: number): Promise<{ count: number; ttlSec: number }>;
}

export interface RateRule {
  name: string;
  limit: number;
  windowSec: number;
}

export interface RateDecision {
  ok: boolean;
  retryAfterSec: number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}
  async hit(key: string, windowSec: number) {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + windowSec * 1000 };
      this.buckets.set(key, b);
    }
    b.count += 1;
    return { count: b.count, ttlSec: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) };
  }
}

/** Minimal Valkey client surface (iovalkey and ioredis both provide `eval`). */
export interface ValkeyEvalClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

const HIT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local t = redis.call('TTL', KEYS[1])
return {c, t}`;

export class ValkeyRateLimitStore implements RateLimitStore {
  constructor(
    private readonly client: ValkeyEvalClient,
    private readonly prefix = 'rl:',
  ) {}
  async hit(key: string, windowSec: number) {
    const res = (await this.client.eval(HIT_SCRIPT, 1, this.prefix + key, windowSec)) as [number, number];
    return { count: Number(res[0]), ttlSec: Math.max(1, Number(res[1])) };
  }
}

export const rules = {
  /** Sign in, sign up, OTP and passkey ceremonies under /api/auth, per IP. */
  authIp: { name: 'auth-ip', limit: 30, windowSec: 60 },
  /** Requests that send an e-mail code, per IP. */
  codeIp: { name: 'code-ip', limit: 5, windowSec: 600 },
  /** edu.tr code requests per user. */
  eduUser: { name: 'edu-user', limit: 3, windowSec: 3600 },
  /** Account endpoints per user. */
  meUser: { name: 'me-user', limit: 60, windowSec: 60 },
  /** Data export per user (expensive). */
  exportUser: { name: 'export-user', limit: 3, windowSec: 3600 },
  /** KVKK applications per user. */
  kvkkUser: { name: 'kvkk-user', limit: 5, windowSec: 86400 },
  /** KVKK applications without an account, per IP. */
  kvkkGuestIp: { name: 'kvkk-guest-ip', limit: 5, windowSec: 3600 },
  /** Guest code confirmation, per IP and per application (brute force of the 6 digits). */
  kvkkVerifyIp: { name: 'kvkk-verify-ip', limit: 20, windowSec: 3600 },
  kvkkVerifyId: { name: 'kvkk-verify-id', limit: 5, windowSec: 3600 },
  /** Takedown intake per IP. */
  takedownIp: { name: 'takedown-ip', limit: 10, windowSec: 3600 },
  /** Push target registrations (Web Push, APNs) per user. */
  pushUser: { name: 'push-user', limit: 20, windowSec: 3600 },
  /** Admin TOTP step per user. */
  stepUpUser: { name: 'step-up-user', limit: 5, windowSec: 600 },
  /** Admin API per user. */
  adminUser: { name: 'admin-user', limit: 300, windowSec: 60 },
  /** Public profession list per IP. */
  publicIp: { name: 'public-ip', limit: 120, windowSec: 60 },
} satisfies Record<string, RateRule>;

export class RateLimiter {
  constructor(private readonly store: RateLimitStore) {}
  async check(rule: RateRule, subject: string): Promise<RateDecision> {
    const { count, ttlSec } = await this.store.hit(`${rule.name}:${subject}`, rule.windowSec);
    return { ok: count <= rule.limit, retryAfterSec: count <= rule.limit ? 0 : ttlSec };
  }
}

/**
 * Client IP with a fixed number of trusted proxies (plan 5.6/3, wt.71): take the entry that the
 * outermost trusted proxy appended, never the client supplied left end of X-Forwarded-For.
 */
export function clientIp(headers: Headers, trustedProxies: number): string {
  const xff = headers.get('x-forwarded-for');
  if (trustedProxies > 0 && xff) {
    const parts = xff
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const pick = parts[parts.length - trustedProxies];
    if (pick) return pick;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
