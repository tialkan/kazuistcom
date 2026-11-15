import { createHash } from 'node:crypto';
import {
  BudgetGuard,
  createAdapters,
  createGateway,
  dailyBudgetTry,
  DEFAULT_BUDGET,
  MemoryCounterStore,
  MemoryNonceStore,
  platformAiAvailable,
  ProviderSwitch,
  sanitizeMetric,
  scrub,
  usdTryRate,
  valkeyNonceStore,
  type CounterStore,
  type GatewayDeps,
  type LedgerReservations,
  type MetricSink,
  type NameRecognizer,
  type NonceStore,
  type PlatformCapAlert,
  type SettlementFailure,
} from '@kazuist/ai-gateway';
import { nameSpans } from '@kazuist/casuist';
import { ensureWallet, walletRunner } from '@kazuist/ledger/pg';
import { LedgerReservationsAdapter } from '@kazuist/ledger';
import type { ByokProvider } from '@kazuist/contracts';
import { logEvent } from '@kazuist/log';
import { sharedPool, sharedValkey } from '@/server/deps';

/**
 * Wiring of packages/ai-gateway for the sourced summary (plan 7.4, 8). Only masked text leaves the server: the
 * gateway scrubs question and passages with the structural recognisers and the name rules below (plan 8.5).
 */

/** Person name spans for the scrubber; the NER service plugs in here when it is reachable from Node. */
export const nameRecognizer: NameRecognizer = { find: (text) => nameSpans(text) };

/** Masks a query before it reaches the embedding service or a live source. */
export async function maskQuery(q: string): Promise<string> {
  const r = await scrub(q, nameRecognizer);
  r.mapping.clear();
  return r.text;
}

/** Valkey counters for the gateway budget and the daily free summaries (INCRBY with a day TTL). */
export interface ValkeyCounterClient {
  get(key: string): Promise<string | null>;
  incrbyfloat(key: string, by: number): Promise<string>;
  expire(key: string, seconds: number): Promise<number>;
}

export function valkeyCounterStore(client: ValkeyCounterClient, prefix = 'ai:'): CounterStore {
  return {
    async get(key) {
      return Number((await client.get(prefix + key)) ?? 0) || 0;
    },
    async incrBy(key, by, ttl) {
      // INCRBYFLOAT: the platform spend counter adds fractional TL amounts.
      const v = Number(await client.incrbyfloat(prefix + key, by));
      if (ttl > 0) await client.expire(prefix + key, ttl);
      return v;
    },
  };
}

/** Request ids of sourced summaries (ozet.ts); only these are charged by validated sentences. */
const SUMMARY_REQUEST = 'ozet:';

/**
 * Charges only validated sentences (plan 4.5/3). The gateway decides the charge from raw model lines; this
 * wrapper turns the consume into a release when the validator accepted nothing. docs/istekler asks yz-gecidi
 * to take the validated count directly. Other operations on the same gateway (writing tools through
 * `gateway.complete`) already decide their charge with their own schema check and pass through unchanged.
 */
export class ValidatedChargeLedger implements LedgerReservations {
  private readonly requestOf = new Map<string, string>();
  private readonly accepted = new Map<string, number>();
  constructor(private readonly inner: LedgerReservations) {}

  setAccepted(requestId: string, count: number): void {
    this.accepted.set(requestId, count);
  }
  forget(requestId: string): void {
    this.accepted.delete(requestId);
  }
  async reserve(input: { userId: string; credits: number; idempotencyKey: string }) {
    const r = await this.inner.reserve(input);
    this.requestOf.set(r.reservationId, input.idempotencyKey);
    return r;
  }
  async consume(reservationId: string, credits: number): Promise<void> {
    const req = this.requestOf.get(reservationId);
    this.requestOf.delete(reservationId);
    if (req?.startsWith(SUMMARY_REQUEST) && (this.accepted.get(req) ?? 0) === 0)
      return this.inner.release(reservationId);
    return this.inner.consume(reservationId, credits);
  }
  async release(reservationId: string): Promise<void> {
    this.requestOf.delete(reservationId);
    return this.inner.release(reservationId);
  }
}

export interface SummaryDeps {
  gateway: ReturnType<typeof createGateway>;
  ledger: ValidatedChargeLedger;
  counters: CounterStore;
  nonces: NonceStore;
  /**
   * The platform pays for AI calls (platform key and AI_DAILY_BUDGET_TRY, or test keys). When false the summary
   * endpoint refuses platform mode at once and the pages offer BYOK instead (platformAiAvailable).
   */
  platformAcik: boolean;
  /** BYOK_SIGNING_SECRET; prepare and verify answer 503 without it. */
  signingSecret: string | null;
  hashSecret: string;
  now: () => Date;
}

/** Ledger reservations over the credit ledger tables (packages/ledger). */
function dbLedger(url: string): LedgerReservations {
  const pool = sharedPool(url);
  return new LedgerReservationsAdapter(walletRunner({ pool }), (userId) => ensureWallet(pool, userId));
}

/** No credit store configured: paid summaries are refused, free and BYOK summaries still run. */
const noLedger: LedgerReservations = {
  async reserve() {
    throw Object.assign(new Error('ledger unavailable'), { code: undefined });
  },
  async consume() {
    throw new Error('ledger unavailable');
  },
  async release() {
    return undefined;
  },
};

let current: SummaryDeps | undefined;

/**
 * review.md P8.5: production used to fall back silently to in-process counters and nonces when VALKEY_URL was
 * missing. That breaks the daily free allowance, the IP and platform caps and single use nonces as soon as the
 * process restarts or a second instance runs. Production now refuses to build the summary dependencies.
 */
export class GatewayConfigError extends Error {
  override name = 'GatewayConfigError';
  constructor(readonly missing: string[]) {
    super(`missing in production: ${missing.join(', ')}`);
  }
}

function requireProductionConfig(
  env: Record<string, string | undefined>,
  overrides: { counters?: CounterStore; nonces?: NonceStore; hashSecret?: string },
): void {
  if (env.NODE_ENV !== 'production') return;
  const missing: string[] = [];
  if (!env.VALKEY_URL && !(overrides.counters && overrides.nonces)) missing.push('VALKEY_URL');
  if (!env.BETTER_AUTH_SECRET && !overrides.hashSecret) missing.push('BETTER_AUTH_SECRET');
  if (!missing.length) return;
  // Variable names only, never values.
  logEvent('error', 'gecit', { error: 'GatewayConfigError', missing });
  throw new GatewayConfigError(missing);
}

/** Operator alert for a reservation that could not be settled; ids and amounts only (plan 8.8). */
function settleAlert(f: SettlementFailure): void {
  logEvent('error', 'gecit', {
    error: 'ledger_settle_failed',
    requestId: f.requestId,
    action: f.action,
    credits: f.credits,
    kind: f.errorKind,
  });
}

/** Gateway metrics (plan 8.8): only the whitelisted metadata fields of sanitizeMetric, one info line each. */
const metricSink: MetricSink = (m) => logEvent('info', 'ai-gateway', { ...sanitizeMetric(m) });

/**
 * Operator alert for the daily platform ceiling (plan 8.7/2) through @kazuist/log, like the other gecit alerts:
 * amounts and day only. A staff notification job needs a notify contract change
 * (docs/istekler/yz-gecidi-platform-tavan-uyarisi.md); until then buildSummaryDeps takes an extra hook.
 */
export function platformCapAlert(a: PlatformCapAlert): void {
  logEvent('error', 'gecit', {
    event: a.kind,
    trigger: a.trigger,
    day: a.day,
    spendTl: Math.round(a.spendTl * 100) / 100,
    capTl: a.capTl,
  });
}

/** Configuration warnings: variable names only, never values; once per process. */
const warned = new Set<string>();
function warnConfig(error: string, name: string): void {
  if (warned.has(`${error}:${name}`)) return;
  warned.add(`${error}:${name}`);
  logEvent('warn', 'gecit', { error, name });
}

/**
 * Platform keys only when the platform AI is available: a key without an explicit AI_DAILY_BUDGET_TRY used to run
 * under the 1.000 TL default ceiling while the runbook promised BYOK only. Now the operator sets both or neither.
 */
function envPlatformKeys(env: Record<string, string | undefined>): Partial<Record<ByokProvider, string>> {
  const keys: Partial<Record<ByokProvider, string>> = {};
  if (!platformAiAvailable(env)) {
    if (env.OPENROUTER_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim())
      warnConfig('platform_ai_off', 'AI_DAILY_BUDGET_TRY');
    return keys;
  }
  if (env.OPENROUTER_API_KEY?.trim()) keys.openrouter = env.OPENROUTER_API_KEY.trim();
  if (env.ANTHROPIC_API_KEY?.trim()) keys.anthropic = env.ANTHROPIC_API_KEY.trim();
  return keys;
}

/** Tests replace the dependencies. */
export function setSummaryDeps(d: SummaryDeps | undefined): void {
  current = d;
}

export function buildSummaryDeps(
  overrides: Partial<Omit<GatewayDeps, 'ledger'>> & {
    ledger?: LedgerReservations;
    counters?: CounterStore;
    nonces?: NonceStore;
    signingSecret?: string | null;
    hashSecret?: string;
    now?: () => Date;
    /** Extra receiver of the platform ceiling alert (a staff notification once the contract allows it). */
    onPlatformCap?: (a: PlatformCapAlert) => void;
  } = {},
  env: Record<string, string | undefined> = process.env,
): SummaryDeps {
  requireProductionConfig(env, overrides);
  const counters =
    overrides.counters ??
    (env.VALKEY_URL ? valkeyCounterStore(sharedValkey(env.VALKEY_URL)) : new MemoryCounterStore());
  const nonces =
    overrides.nonces ??
    (env.VALKEY_URL
      ? valkeyNonceStore({
          set: async (k, v, o) =>
            (await sharedValkey(env.VALKEY_URL ?? '').set(k, v, 'EX', o.EX, 'NX')) as 'OK' | null,
          getDel: (k) => sharedValkey(env.VALKEY_URL ?? '').getdel(k),
        })
      : new MemoryNonceStore());
  const ledger = new ValidatedChargeLedger(
    overrides.ledger ?? (env.DATABASE_URL ? dbLedger(env.DATABASE_URL) : noLedger),
  );
  const platformKeys = overrides.platformKeys ?? envPlatformKeys(env);
  const cap = dailyBudgetTry(env);
  const rate = usdTryRate(env);
  if (rate.invalid) warnConfig('invalid_env', 'AI_USD_TRY_RATE');
  const now = overrides.now ?? (() => new Date());
  const onCap = overrides.onPlatformCap;
  const gateway = createGateway({
    adapters: overrides.adapters ?? createAdapters(),
    budget:
      overrides.budget ??
      new BudgetGuard(
        counters,
        { ...DEFAULT_BUDGET, ...(cap === null ? {} : { platformDailyTlCap: cap }) },
        now,
        (a) => {
          platformCapAlert(a);
          onCap?.(a);
        },
      ),
    switches: overrides.switches ?? new ProviderSwitch(),
    ledger,
    platformKeys,
    usdTryRate: overrides.usdTryRate ?? rate.rate,
    sink: overrides.sink ?? metricSink,
    ner: overrides.ner ?? nameRecognizer,
    onSettleFailure: overrides.onSettleFailure ?? settleAlert,
    ...(overrides.onCost ? { onCost: overrides.onCost } : {}),
    ...(overrides.now ? { now: () => now().getTime() } : {}),
  });
  return {
    gateway,
    ledger,
    counters,
    nonces,
    platformAcik: Object.values(platformKeys).some(Boolean),
    signingSecret:
      overrides.signingSecret === undefined ? (env.BYOK_SIGNING_SECRET ?? null) : overrides.signingSecret,
    hashSecret: overrides.hashSecret ?? env.BETTER_AUTH_SECRET ?? 'yerel-gelistirme',
    now,
  };
}

export function getSummaryDeps(): SummaryDeps {
  current ??= buildSummaryDeps();
  return current;
}

/** Keyed hash of a user or IP for counters and metrics; never the raw value. */
export function keyedHash(secret: string, kind: string, value: string): string {
  return createHash('sha256').update(`${secret}:${kind}:${value}`).digest('hex').slice(0, 24);
}

/** Calendar day in Europe/Istanbul, the day the free allowance resets. */
export function istanbulDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);
}
