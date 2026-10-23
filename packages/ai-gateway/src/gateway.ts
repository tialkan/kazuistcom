import type { ByokProvider, ModelLine } from '@kazuist/contracts';
import { BudgetGuard, ProviderSwitch } from './budget.ts';
import { geminiPolicy, type ContentSensitivity, type GeminiBilling } from './gemini.ts';
import { parseJsonLines } from './jsonl.ts';
import { reservationErrorCode, type CostEvent, type LedgerReservations } from './ledger.ts';
import { sanitizeMetric, type MetricSink } from './observe.ts';
import { restore, scrub, type NameRecognizer } from './pii.ts';
import { SOURCED_SUMMARY_SYSTEM, buildSourcedPrompt, type Passage } from './prompt.ts';
import { ROUTES, costUsd, estimateTokens, platformModel } from './routing.ts';
import {
  ProviderError,
  type GatewayMode,
  type Operation,
  type OpenRouterOptions,
  type ProviderAdapter,
  type StreamChunk,
} from './types.ts';

export const USD_TL = 50;

export interface ByokRelay {
  provider: ByokProvider;
  model: string;
  /** Lives only in this request object; never stored, logged or put into errors. */
  apiKey: string;
  openRouter?: OpenRouterOptions;
  /** Only 'ucretli' (declared paid billing) opens Gemini BYOK. */
  geminiBilling?: GeminiBilling;
}

export interface RunInput {
  requestId: string;
  operation: Operation;
  mode: Exclude<GatewayMode, 'byok_istemci'>;
  userId: string;
  userHash: string;
  ipHash: string;
  credits: number;
  free: boolean;
  question: string;
  passages: Passage[];
  content?: ContentSensitivity;
  byok?: ByokRelay;
  signal?: AbortSignal;
  /** Put masked values back for display to the same user. Default false: labels stay. */
  restoreLabels?: boolean;
}

export type GatewayEvent =
  { t: 'satir'; line: ModelLine } | { t: 'gecersiz' } | { t: 'bitti'; cost: CostEvent; abstained: boolean };

export class GatewayError extends Error {
  constructor(
    readonly code:
      'bad_request' | 'forbidden' | 'payload_too_large' | 'unavailable' | 'insufficient_credits' | 'conflict',
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export interface GatewayDeps {
  adapters: Record<ByokProvider, ProviderAdapter>;
  budget: BudgetGuard;
  switches: ProviderSwitch;
  ledger: LedgerReservations;
  /** Platform keys, read from secrets by the caller. */
  platformKeys: Partial<Record<ByokProvider, string>>;
  /** Model per provider in platform mode when the provider is not Anthropic. */
  platformModelFor?: (provider: ByokProvider, anthropicModel: string) => string;
  sink: MetricSink;
  ner?: NameRecognizer;
  onCost?: (e: CostEvent) => void;
  now?: () => number;
}

export function createGateway(deps: GatewayDeps) {
  const now = deps.now ?? Date.now;
  const modelFor = deps.platformModelFor ?? platformModel;

  async function* run(input: RunInput): AsyncGenerator<GatewayEvent> {
    const route = ROUTES[input.operation];
    const started = now();
    if (input.mode === 'byok_aktarma' && !input.byok)
      throw new GatewayError('bad_request', 400, 'byok required');
    if (input.byok?.provider === 'gemini') {
      const d = geminiPolicy(input.byok.geminiBilling ?? 'bilinmiyor');
      if (!d.allowed) throw new GatewayError('forbidden', 403, 'gemini byok requires paid billing');
    }

    // plan 8.5: scrub question and passages together so labels are consistent.
    const SEP = '\u0000\u0001';
    const joined = [input.question, ...input.passages.map((p) => p.text)].join(SEP);
    const scrubbed = await scrub(joined, deps.ner);
    const parts = scrubbed.text.split(SEP);
    const passages = input.passages.map((p, i) => ({ ...p, text: parts[i + 1] ?? '' }));
    const prompt = buildSourcedPrompt(parts[0] ?? '', passages);
    if (estimateTokens(SOURCED_SUMMARY_SYSTEM + prompt) > route.maxInputTokens)
      throw new GatewayError('payload_too_large', 413, 'input exceeds route limit');

    const platform = input.mode === 'platform';
    const admission = await deps.budget.admit({
      userHash: input.userHash,
      ipHash: input.ipHash,
      credits: platform && !input.free ? input.credits : 0,
      free: platform && input.free,
    });
    let reservation: { reservationId: string } | null = null;
    if (platform && !input.free && input.credits > 0) {
      try {
        reservation = await deps.ledger.reserve({
          userId: input.userId,
          credits: input.credits,
          idempotencyKey: input.requestId,
        });
      } catch (e) {
        // audit Y7: the request never ran, so the stream slot and counters are rolled back.
        await admission.rollback();
        const code = reservationErrorCode(e);
        if (code === 'already_settled') throw new GatewayError('conflict', 409, 'request already settled');
        if (code) throw new GatewayError('insufficient_credits', 402, 'not enough credits');
        throw new GatewayError('unavailable', 503, 'ledger unavailable');
      }
    }

    let provider: ByokProvider = input.byok?.provider ?? 'openrouter';
    let model = input.byok?.model ?? route.model;
    let inputTokens = 0;
    let outputTokens = 0;
    let dropped = 0;
    let sentences = 0;
    let outcome: 'ok' | 'cekimser' | 'hata' = 'hata';
    let errorKind: string | undefined;
    let pendingDone: { cost: CostEvent; abstained: boolean } | null = null;
    const back = (t: string): string => (input.restoreLabels ? restore(t, scrubbed.mapping) : t);
    try {
      const attempts: { provider: ByokProvider; model: string; key: string; or?: OpenRouterOptions }[] =
        platform
          ? deps.switches.candidates().flatMap((p) => {
              const key = deps.platformKeys[p];
              if (!key) return [];
              // ADR-0025: every platform OpenRouter call denies data collection and requires ZDR.
              const or: OpenRouterOptions | undefined = p === 'openrouter' ? { zdr: true } : undefined;
              return [{ provider: p, model: modelFor(p, route.model), key, ...(or ? { or } : {}) }];
            })
          : input.byok && deps.switches.isEnabled(input.byok.provider)
            ? [
                {
                  provider: input.byok.provider,
                  model: input.byok.model,
                  key: input.byok.apiKey,
                  ...(input.byok.openRouter ? { or: input.byok.openRouter } : {}),
                },
              ]
            : [];
      if (!attempts.length) throw new GatewayError('unavailable', 503, 'no provider available');

      let stream: AsyncIterator<StreamChunk> | null = null;
      let first: IteratorResult<StreamChunk> | null = null;
      for (const a of attempts) {
        try {
          const iterable = deps.adapters[a.provider].stream(
            {
              provider: a.provider,
              model: a.model,
              system: SOURCED_SUMMARY_SYSTEM,
              prompt,
              maxOutputTokens: route.maxOutputTokens,
            },
            {
              apiKey: a.key,
              ...(input.signal ? { signal: input.signal } : {}),
              ...(a.or ? { openRouter: a.or } : {}),
            },
          );
          const it = iterable[Symbol.asyncIterator]();
          first = await it.next();
          stream = it;
          provider = a.provider;
          model = a.model;
          break;
        } catch (e) {
          // Fallback only before any output (plan 8.7/3).
          if (!(e instanceof ProviderError) || !platform) throw e;
          errorKind = `provider_${e.status}`;
        }
      }
      if (!stream || !first) throw new GatewayError('unavailable', 503, 'all providers failed');

      const s = stream;
      const f = first;
      async function* texts(): AsyncGenerator<string> {
        let cur: IteratorResult<StreamChunk> = f;
        while (!cur.done) {
          const c = cur.value;
          if (c.type === 'text') yield c.text;
          else {
            inputTokens = c.inputTokens;
            outputTokens = c.outputTokens;
          }
          cur = await s.next();
        }
      }
      for await (const item of parseJsonLines(texts())) {
        if (!item.ok) {
          dropped++;
          yield { t: 'gecersiz' };
          continue;
        }
        const line = item.line;
        if (line.t === 'cumle') {
          sentences++;
          const alinti: Record<string, string> = {};
          for (const [k, v] of Object.entries(line.alinti)) alinti[k] = back(v);
          yield { t: 'satir', line: { ...line, metin: back(line.metin), alinti } };
        } else {
          yield { t: 'satir', line };
        }
      }
      // The parser stops at `son`; drain the rest so the usage chunk is counted. Text after `son` is ignored.
      for (let cur = await s.next(); !cur.done; cur = await s.next()) {
        if (cur.value.type === 'usage') {
          inputTokens = cur.value.inputTokens;
          outputTokens = cur.value.outputTokens;
        }
      }
      outcome = sentences > 0 ? 'ok' : 'cekimser';
    } catch (e) {
      errorKind = e instanceof Error ? e.name : 'unknown';
      throw e;
    } finally {
      admission.release();
      // plan 4.5/3: abstention and technical errors are free.
      const charge = outcome === 'ok' && reservation ? input.credits : 0;
      if (reservation) {
        if (charge > 0) await deps.ledger.consume(reservation.reservationId, charge);
        else await deps.ledger.release(reservation.reservationId);
      }
      const usd = platform ? costUsd(model, inputTokens, outputTokens) : 0;
      if (usd > 0) await deps.budget.recordSpendTl(usd * USD_TL);
      const cost: CostEvent = {
        requestId: input.requestId,
        operation: input.operation,
        provider,
        model,
        mode: input.mode,
        inputTokens,
        outputTokens,
        costUsd: usd,
        costTl: usd * USD_TL,
        creditsCharged: charge,
        reservationId: reservation?.reservationId ?? null,
        at: new Date(now()).toISOString(),
      };
      deps.onCost?.(cost);
      deps.sink(
        sanitizeMetric({
          requestId: input.requestId,
          operation: input.operation,
          mode: input.mode,
          provider,
          model,
          inputTokens,
          outputTokens,
          durationMs: now() - started,
          costUsd: usd,
          userHash: input.userHash,
          outcome,
          droppedLines: dropped,
          ...(errorKind ? { errorKind } : {}),
        }),
      );
      scrubbed.mapping.clear();
      if (outcome !== 'hata') pendingDone = { cost, abstained: outcome === 'cekimser' };
    }
    if (pendingDone) yield { t: 'bitti', ...pendingDone };
  }
  return { run };
}
