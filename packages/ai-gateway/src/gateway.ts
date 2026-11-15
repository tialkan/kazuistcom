import type { ByokProvider, ModelLine } from '@kazuist/contracts';
import { BudgetGuard, ProviderSwitch } from './budget.ts';
import { geminiPolicy, type ContentSensitivity, type GeminiBilling } from './gemini.ts';
import { parseJsonLines } from './jsonl.ts';
import {
  reservationErrorCode,
  type CostEvent,
  type LedgerReservations,
  type SettlementFailure,
} from './ledger.ts';
import { sanitizeMetric, type MetricSink } from './observe.ts';
import { restore, scrubParts, scrubSourced, type NameRecognizer } from './pii.ts';
import { SOURCED_SUMMARY_SYSTEM, buildSourcedPrompt, type Passage } from './prompt.ts';
import { PLATFORM_REASONING_EFFORT, ROUTES, costUsd, estimateTokens, platformModel } from './routing.ts';
import {
  ProviderError,
  type GatewayMode,
  type Operation,
  type OpenRouterOptions,
  type ProviderAdapter,
  type ReasoningEffort,
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

/** Who calls, who pays and how; shared by run() and complete(). */
export interface CallInput {
  requestId: string;
  operation: Operation;
  mode: Exclude<GatewayMode, 'byok_istemci'>;
  userId: string;
  userHash: string;
  ipHash: string;
  credits: number;
  free: boolean;
  content?: ContentSensitivity;
  byok?: ByokRelay;
  signal?: AbortSignal;
  /** Put masked values back for display to the same user. Default false: labels stay. */
  restoreLabels?: boolean;
}

/** Sourced summary (plan 7.4, Ek D): question and passages, wrapped in the fixed Ek D prompt. */
export interface RunInput extends CallInput {
  question: string;
  passages: Passage[];
}

/**
 * General completion (docs/istekler/yazma-yz-gecidi.md): a fixed instruction and a user or document prompt. The
 * prompt is scrubbed here (plan 8.5); budget, ledger hold, provider fallback, cost event and metric are the same
 * as for run().
 */
export interface CompleteInput extends CallInput {
  /** Fixed instruction written by Kazuist; never derived from user or document text. */
  system: string;
  /** User or document text inside its own data markers, already neutralised by the caller; not yet masked. */
  prompt: string;
  /** 'fallback' uses the route's fallback model (kural_cikarma: Sonnet 5.5 after Haiku failed the schema). */
  modelTier?: 'primary' | 'fallback';
  /**
   * Whether the answer is usable (a schema check). Credits are consumed only when it returns true; otherwise the
   * hold is released, like an abstention (plan 4.5/3). Default: any non-blank answer.
   */
  accept?: (text: string) => boolean;
}

export interface CompleteResult {
  /** Model answer; mask labels are put back only when restoreLabels was set. */
  text: string;
  accepted: boolean;
  cost: CostEvent;
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
  /** Operator alert when consume or release kept failing; the stream still ends normally. */
  onSettleFailure?: (f: SettlementFailure) => void;
  now?: () => number;
}

/** Attempts per settlement; only failures without a typed ledger code are retried. */
const SETTLE_ATTEMPTS = 2;

const ledgerCode = (e: unknown): string | null => {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  return typeof code === 'string' && code ? code : null;
};

type Outcome = 'ok' | 'cekimser' | 'hata';

interface FinishOptions {
  /** Consume the held credits; only honoured for outcome 'ok'. */
  charge: boolean;
  droppedLines?: number;
  errorKind?: string;
}

/** One admitted provider call: text deltas, then a single finish that settles and reports. */
interface Call {
  texts(): AsyncGenerator<string>;
  /** Reads what is left after the caller stopped, so the usage chunk is counted. */
  drain(): Promise<void>;
  /**
   * Releases the stream slot, records platform spend, settles the hold and writes the cost event and the metric.
   * Never throws; a second call returns the first result.
   */
  finish(outcome: Outcome, opts: FinishOptions): Promise<CostEvent>;
}

export function createGateway(deps: GatewayDeps) {
  const now = deps.now ?? Date.now;
  const modelFor = deps.platformModelFor ?? platformModel;

  /**
   * Consume or release one reservation without ever throwing (review.md P8.5). A failure used to escape the
   * generator's finally block: the user lost the end of a finished summary, no cost event or metric was written
   * and the platform spend counter missed a paid call. Now the result says what the ledger really recorded.
   */
  async function settle(
    requestId: string,
    reservationId: string,
    credits: number,
  ): Promise<{ ok: boolean; charged: number; errorKind?: string }> {
    const action = credits > 0 ? 'consume' : 'release';
    let errorKind = 'unknown';
    for (let attempt = 1; attempt <= SETTLE_ATTEMPTS; attempt++) {
      try {
        if (credits > 0) await deps.ledger.consume(reservationId, credits);
        else await deps.ledger.release(reservationId);
        return { ok: true, charged: credits };
      } catch (e) {
        const code = ledgerCode(e);
        // A retry that finds the hold settled: the first attempt committed before its reply was lost.
        if (attempt > 1 && code === 'already_settled') return { ok: true, charged: credits };
        errorKind = code ?? (e instanceof Error ? e.name : 'unknown');
        // Typed ledger answers (expired, already settled) are final; only unknown failures are retried.
        if (code) break;
      }
    }
    try {
      deps.onSettleFailure?.({ requestId, reservationId, action, credits, errorKind });
    } catch {
      // The alert hook must not break the stream either.
    }
    return { ok: false, charged: 0, errorKind };
  }

  /** Mode and provider policy that holds before anything is scrubbed or counted. */
  function checkPolicy(input: CallInput): void {
    if (input.mode === 'byok_aktarma' && !input.byok)
      throw new GatewayError('bad_request', 400, 'byok required');
    if (input.byok?.provider === 'gemini') {
      const d = geminiPolicy(input.byok.geminiBilling ?? 'bilinmiyor');
      if (!d.allowed) throw new GatewayError('forbidden', 403, 'gemini byok requires paid billing');
    }
  }

  /**
   * Admits the call against every budget, holds the credits and opens the first provider that answers. The
   * prompt must already be scrubbed. Errors before any output are thrown here, after the hold was released.
   */
  async function open(
    input: CallInput,
    system: string,
    prompt: string,
    anthropicModel: string,
  ): Promise<Call> {
    const route = ROUTES[input.operation];
    const started = now();
    if (estimateTokens(system + prompt) > route.maxInputTokens)
      throw new GatewayError('payload_too_large', 413, 'input exceeds route limit');

    const platform = input.mode === 'platform';
    const admission = await deps.budget.admit({
      userHash: input.userHash,
      ipHash: input.ipHash,
      platform,
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
    let model = input.byok?.model ?? anthropicModel;
    let inputTokens = 0;
    let outputTokens = 0;
    /** A provider that failed before output while a later one answered; reported in the metric. */
    let fallbackError: string | undefined;
    let stream: AsyncIterator<StreamChunk> | null = null;
    let streamDone = false;
    let finished: CostEvent | null = null;

    async function finish(outcome: Outcome, opts: FinishOptions): Promise<CostEvent> {
      if (finished) return finished;
      let errorKind = opts.errorKind ?? fallbackError;
      // A caller that stopped early (abort, cancel) closes the provider stream and its deadline timers.
      if (stream && !streamDone) {
        streamDone = true;
        await Promise.resolve(stream.return?.()).catch(() => undefined);
      }
      admission.release();
      // plan 4.5/3: abstention and technical errors are free.
      const due = outcome === 'ok' && opts.charge && reservation ? input.credits : 0;
      const usd = platform ? costUsd(model, inputTokens, outputTokens) : 0;
      // The provider is paid whatever the ledger does next, so the platform spend is counted first (plan 8.7/2).
      if (usd > 0) {
        try {
          await deps.budget.recordSpendTl(usd * USD_TL);
        } catch {
          errorKind ??= 'budget_spend_failed';
        }
      }
      let charge = 0;
      let settlement: CostEvent['settlement'] = 'none';
      if (reservation) {
        const r = await settle(input.requestId, reservation.reservationId, due);
        charge = r.charged;
        settlement = r.ok ? 'ok' : 'failed';
        if (!r.ok) errorKind = `ledger_${r.errorKind ?? 'unknown'}`;
      }
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
        creditsDue: due,
        settlement,
        reservationId: reservation?.reservationId ?? null,
        at: new Date(now()).toISOString(),
      };
      finished = cost;
      try {
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
            droppedLines: opts.droppedLines ?? 0,
            ...(errorKind ? { errorKind } : {}),
          }),
        );
      } catch {
        // Observation must not break the call.
      }
      return cost;
    }

    let first: IteratorResult<StreamChunk> | null = null;
    try {
      const effort: ReasoningEffort | undefined = PLATFORM_REASONING_EFFORT[anthropicModel];
      const attempts: {
        provider: ByokProvider;
        model: string;
        key: string;
        or?: OpenRouterOptions;
        effort?: ReasoningEffort;
      }[] = platform
        ? deps.switches.candidates().flatMap((p) => {
            const key = deps.platformKeys[p];
            if (!key) return [];
            // ADR-0025: every platform OpenRouter call denies data collection and requires ZDR.
            const or: OpenRouterOptions | undefined = p === 'openrouter' ? { zdr: true } : undefined;
            return [
              {
                provider: p,
                model: modelFor(p, anthropicModel),
                key,
                ...(or ? { or } : {}),
                ...(effort ? { effort } : {}),
              },
            ];
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

      for (const a of attempts) {
        try {
          const iterable = deps.adapters[a.provider].stream(
            {
              provider: a.provider,
              model: a.model,
              system,
              prompt,
              maxOutputTokens: route.maxOutputTokens,
              ...(a.effort ? { reasoningEffort: a.effort } : {}),
            },
            {
              apiKey: a.key,
              timeoutMs: route.timeoutMs,
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
          fallbackError = `provider_${e.status}`;
        }
      }
      if (!stream || !first) throw new GatewayError('unavailable', 503, 'all providers failed');
    } catch (e) {
      await finish('hata', { charge: false, errorKind: e instanceof Error ? e.name : 'unknown' });
      throw e;
    }

    const s = stream;
    const f = first;
    const record = (c: StreamChunk): void => {
      if (c.type === 'usage') {
        inputTokens = c.inputTokens;
        outputTokens = c.outputTokens;
      }
    };
    return {
      async *texts() {
        let cur: IteratorResult<StreamChunk> = f;
        while (!cur.done) {
          const c = cur.value;
          if (c.type === 'text') yield c.text;
          else record(c);
          cur = await s.next();
        }
        streamDone = true;
      },
      async drain() {
        if (streamDone) return;
        for (let cur = await s.next(); !cur.done; cur = await s.next()) record(cur.value);
        streamDone = true;
      },
      finish,
    };
  }

  async function* run(input: RunInput): AsyncGenerator<GatewayEvent> {
    checkPolicy(input);
    // plan 8.5: one label space, passages first, so verify can rebuild the passages without the question.
    const scrubbed = await scrubSourced(
      input.question,
      input.passages.map((p) => p.text),
      deps.ner,
    );
    let call: Call;
    try {
      const passages = input.passages.map((p, i) => ({ ...p, text: scrubbed.passages[i] ?? '' }));
      const prompt = buildSourcedPrompt(scrubbed.question, passages);
      call = await open(input, SOURCED_SUMMARY_SYSTEM, prompt, ROUTES[input.operation].model);
    } catch (e) {
      scrubbed.mapping.clear();
      throw e;
    }

    let dropped = 0;
    let sentences = 0;
    let outcome: Outcome = 'hata';
    let errorKind: string | undefined;
    let pendingDone: { cost: CostEvent; abstained: boolean } | null = null;
    const back = (t: string): string => (input.restoreLabels ? restore(t, scrubbed.mapping) : t);
    try {
      for await (const item of parseJsonLines(call.texts())) {
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
      await call.drain();
      outcome = sentences > 0 ? 'ok' : 'cekimser';
    } catch (e) {
      errorKind = e instanceof Error ? e.name : 'unknown';
      throw e;
    } finally {
      const cost = await call.finish(outcome, {
        charge: true,
        droppedLines: dropped,
        ...(errorKind ? { errorKind } : {}),
      });
      scrubbed.mapping.clear();
      if (outcome !== 'hata') pendingDone = { cost, abstained: outcome === 'cekimser' };
    }
    if (pendingDone) yield { t: 'bitti', ...pendingDone };
  }

  /** General completion; the whole answer is returned at once (rule extraction, abbreviation suggestions). */
  async function complete(input: CompleteInput): Promise<CompleteResult> {
    checkPolicy(input);
    const route = ROUTES[input.operation];
    const anthropicModel =
      input.modelTier === 'fallback' ? (route.fallbackModel ?? route.model) : route.model;
    const scrubbed = await scrubParts([input.prompt], deps.ner);
    try {
      const call = await open(input, input.system, scrubbed.parts[0] ?? '', anthropicModel);
      let errorKind = 'unknown';
      try {
        let raw = '';
        for await (const t of call.texts()) raw += t;
        await call.drain();
        const text = input.restoreLabels ? restore(raw, scrubbed.mapping) : raw;
        const accepted = input.accept ? input.accept(text) : text.trim().length > 0;
        const cost = await call.finish(accepted ? 'ok' : 'cekimser', { charge: accepted });
        return { text, accepted, cost };
      } catch (e) {
        errorKind = e instanceof Error ? e.name : 'unknown';
        throw e;
      } finally {
        // No-op after a normal finish; after an error it releases the hold and reports the failure.
        await call.finish('hata', { charge: false, errorKind });
      }
    } finally {
      scrubbed.mapping.clear();
    }
  }

  return { run, complete };
}
