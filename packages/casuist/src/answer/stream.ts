import type { AnswerEvent, ModelLine } from '@kazuist/contracts';
import type { NameDetector } from './names.ts';
import { sourceChips, type PromptPassage } from './passages.ts';
import { createLineValidator, type ValidatorSummary, type WarningCode } from './validator.ts';

/** User facing texts, from packages/i18n ozet.json (the core holds no UI strings). */
export interface AnswerTexts {
  sabitFr19: string;
  sabitFr20: string;
  cekimser: string;
  uyari: Record<WarningCode, string>;
}

export interface AnswerStreamInput {
  requestId: string;
  passages: readonly PromptPassage[];
  /** Model lines in order; null stands for a line the gateway could not parse. */
  lines: AsyncIterable<ModelLine | null>;
  texts: AnswerTexts;
  now?: Date;
  names?: NameDetector;
  /** Called once the stream ended, before `son`; returns the credits actually charged. */
  settle: (summary: ValidatorSummary) => Promise<number> | number;
  /**
   * Called after every checked line, before the next line is pulled. The caller uses it to tell the credit
   * reservation whether any sentence was validated, since only validated sentences may be charged (plan 4.5/3).
   */
  onProgress?: (summary: ValidatorSummary) => void;
}

/**
 * Turns model lines into the SSE events of POST /v1/answers (Ek C.1): `kaynaklar` and the fixed warnings first,
 * then only validated `cumle` events with their `uyari` notes, `cekimser` when nothing survived (plan 7.4/4), and
 * `son`. Without sources the stream abstains at once and the model is never consulted by the caller.
 */
export async function* answerEvents(input: AnswerStreamInput): AsyncGenerator<AnswerEvent> {
  const v = createLineValidator(input.passages, {
    ...(input.now ? { now: input.now } : {}),
    ...(input.names ? { names: input.names } : {}),
  });
  yield { t: 'kaynaklar', kaynaklar: sourceChips(input.passages) };
  yield { t: 'uyari', kod: 'sabit_fr19', metin: input.texts.sabitFr19, cumleIndex: null };
  yield { t: 'uyari', kod: 'sabit_fr20', metin: input.texts.sabitFr20, cumleIndex: null };
  input.onProgress?.(v.summary());
  for await (const line of input.lines) {
    const verdict = await v.check(line === null ? '' : line);
    input.onProgress?.(v.summary());
    if (!verdict.ok || verdict.kind !== 'cumle') continue;
    const s = verdict.sentence;
    yield {
      t: 'cumle',
      index: s.index,
      metin: s.metin,
      kaynaklar: s.kaynaklar,
      alinti: s.alinti,
      destekleyici: s.destekleyici,
    };
    for (const w of s.warnings)
      yield { t: 'uyari', kod: w, metin: input.texts.uyari[w], cumleIndex: s.index };
  }
  const summary = v.summary();
  if (summary.abstained) yield { t: 'cekimser', metin: input.texts.cekimser, neden: abstainReason(summary) };
  const charged = await input.settle(summary);
  yield { t: 'son', requestId: input.requestId, creditsCharged: charged, droppedLines: summary.dropped };
}

/** Machine readable reason for abstention; model written text is never shown as the reason. */
export function abstainReason(s: ValidatorSummary): string {
  if (s.dropped > 0) return 'dogrulanamadi';
  if (s.sawInsufficient) return 'kaynak_yetersiz';
  return 'cikti_yok';
}
