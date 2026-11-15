/**
 * AI calls refused for money or quota rather than failing: the user gets a dedicated message instead of the generic
 * "service unreachable" one, because retrying in a minute will not help.
 *
 *   kredi_yetersiz  the user's credit balance does not cover the call (GatewayError, ReservationError and the
 *                   ledger's LedgerError all carry code 'insufficient_credits').
 *   butce_tavani    a spending cap stopped the call: the gateway's BudgetGuard (user daily cap, free uses per IP,
 *                   platform daily cap) or the platform's own OpenRouter balance (HTTP 402 on the platform key).
 *
 * The check is structural (name, code, status), so the core does not import the gateway. A concurrency refusal
 * (BudgetError reason 'eszamanli_akis') is not a cap: it stays a plain model failure and may be retried.
 */
export type YzEngelKodu = 'kredi_yetersiz' | 'butce_tavani';

export function yzEngelKodu(e: unknown): YzEngelKodu | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as { name?: unknown; code?: unknown; status?: unknown; reason?: unknown };
  if (o.code === 'insufficient_credits') return 'kredi_yetersiz';
  if (o.name === 'BudgetError') return o.reason === 'eszamanli_akis' ? null : 'butce_tavani';
  if (o.name === 'ProviderError' && o.status === 402) return 'butce_tavani';
  return null;
}
