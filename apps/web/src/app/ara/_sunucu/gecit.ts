import { createHash } from 'node:crypto';
import {
  BudgetGuard,
  createAdapters,
  createGateway,
  DEFAULT_BUDGET,
  jsonLineSink,
  MemoryCounterStore,
  MemoryNonceStore,
  ProviderSwitch,
  scrub,
  valkeyNonceStore,
  type CounterStore,
  type GatewayDeps,
  type LedgerReservations,
  type NameRecognizer,
  type NonceStore,
  type SettlementFailure,
} from '@kazuist/ai-gateway';
import { nameSpans } from '@kazuist/casuist';
import { ensureWallet, walletRunner } from '@kazuist/ledger/pg';
import { LedgerReservationsAdapter } from '@kazuist/ledger';
import type { ByokProvider } from '@kazuist/contracts';
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
  console.error(JSON.stringify({ at: 'gecit', level: 'error', error: 'GatewayConfigError', missing }));
  throw new GatewayConfigError(missing);
}

/** Operator alert for a reservation that could not be settled; ids and amounts only (plan 8.8). */
function settleAlert(f: SettlementFailure): void {
  console.error(
    JSON.stringify({
      at: 'gecit',
      level: 'error',
      error: 'ledger_settle_failed',
      requestId: f.requestId,
      action: f.action,
      credits: f.credits,
      kind: f.errorKind,
    }),
  );
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
  const platformKeys: Partial<Record<ByokProvider, string>> = {};
  if (env.OPENROUTER_API_KEY) platformKeys.openrouter = env.OPENROUTER_API_KEY;
  if (env.ANTHROPIC_API_KEY) platformKeys.anthropic = env.ANTHROPIC_API_KEY;
  const cap = Number(env.AI_DAILY_BUDGET_TRY ?? '');
  const now = overrides.now ?? (() => new Date());
  const gateway = createGateway({
    adapters: overrides.adapters ?? createAdapters(),
    budget:
      overrides.budget ??
      new BudgetGuard(
        counters,
        { ...DEFAULT_BUDGET, ...(Number.isFinite(cap) && cap > 0 ? { platformDailyTlCap: cap } : {}) },
        now,
      ),
    switches: overrides.switches ?? new ProviderSwitch(),
    ledger,
    platformKeys: overrides.platformKeys ?? platformKeys,
    sink: overrides.sink ?? jsonLineSink((line) => console.info(line)),
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
