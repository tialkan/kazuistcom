/**
 * Platform AI settings read from the server environment (plan 4.4, 8.7/2, ADR-0025). Pure and dependency free, so
 * server pages can call it per request to decide which offer they show (`@kazuist/ai-gateway/config`) and
 * apps/web gecit.ts can wire the gateway from the same reading. Only variable names are ever reported, never values;
 * nothing here may be imported by a client component.
 */
export type Env = Record<string, string | undefined>;

/** plan 4.4: 1 USD = 50 TL (13 October 2026 selling rate 49.37 plus a buffer). */
export const DEFAULT_USD_TRY_RATE = 50;

/**
 * Accepted range of AI_USD_TRY_RATE. Wide enough for years of exchange rate drift, narrow enough to catch an
 * inverted rate (0.02) or a pasted thousands separator (50000).
 */
export const USD_TRY_RATE_BOUNDS = { min: 1, max: 1_000 } as const;

/** Plain decimal with a dot: "50", "49.37". No sign, exponent, comma or spaces inside. */
const DECIMAL = /^\d{1,7}(?:\.\d{1,6})?$/;

const filled = (v: string | undefined): boolean => Boolean(v?.trim());

/**
 * Daily platform spend ceiling in TRY (AI_DAILY_BUDGET_TRY), or null when unset or not a positive number. Without
 * an explicit ceiling no platform call runs: the operator must decide what the platform may spend per day.
 */
export function dailyBudgetTry(env: Env = process.env): number | null {
  const raw = env.AI_DAILY_BUDGET_TRY?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Platform provider keys present in the environment (ADR-0025 order: OpenRouter, then Anthropic direct). */
export function platformKeyNames(env: Env = process.env): ('OPENROUTER_API_KEY' | 'ANTHROPIC_API_KEY')[] {
  return (['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY'] as const).filter((k) => filled(env[k]));
}

/**
 * Whether the platform pays for AI calls: at least one platform key and a valid daily ceiling. When false the
 * daily free allowance and credit calls cannot run, so pages offer BYOK as the way to get a summary and the
 * summary endpoint refuses platform mode up front instead of failing with a provider error.
 */
export function platformAiAvailable(env: Env = process.env): boolean {
  return platformKeyNames(env).length > 0 && dailyBudgetTry(env) !== null;
}

export interface UsdTryRate {
  rate: number;
  /** AI_USD_TRY_RATE was set but rejected; the default is used and the caller logs the variable name. */
  invalid: boolean;
}

/**
 * USD to TRY rate for platform spend and cost events (AI_USD_TRY_RATE). Unset means the plan 4.4 default; a value
 * that is not a plain decimal inside USD_TRY_RATE_BOUNDS is rejected and the default is used, so a typo can never
 * turn the daily ceiling off (a rate of 0 would count every call as free) or trip it at once.
 */
export function usdTryRate(env: Env = process.env): UsdTryRate {
  const raw = env.AI_USD_TRY_RATE?.trim();
  if (!raw) return { rate: DEFAULT_USD_TRY_RATE, invalid: false };
  const n = DECIMAL.test(raw) ? Number(raw) : Number.NaN;
  if (isUsdTryRate(n)) return { rate: n, invalid: false };
  return { rate: DEFAULT_USD_TRY_RATE, invalid: true };
}

export function isUsdTryRate(n: number): boolean {
  return Number.isFinite(n) && n >= USD_TRY_RATE_BOUNDS.min && n <= USD_TRY_RATE_BOUNDS.max;
}
