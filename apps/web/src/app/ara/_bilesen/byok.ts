import { runByokClient, type ByokClientDeps, type ByokSettings } from '@kazuist/ai-gateway/browser';
import { createLineValidator, passagesFromPrompt, type LineValidator } from '@kazuist/casuist/validator';
import type { AnswerEvent, AnswerFilters } from '@kazuist/contracts';
import ozet from '@kazuist/i18n/tr/ozet.json';

/**
 * Sourced summary with the user's own key (plan 8.1 BYOK istemci, K-08). The browser asks Kazuist for a masked,
 * signed bundle, calls OpenRouter directly with the key from Web Storage, validates every line with the casuist
 * browser validator before showing it (the same code as the server) and finally lets the server re-validate.
 * Emits the same events as POST /v1/answers so the summary area renders both paths alike. Never charges.
 */

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const postJson =
  (f: Fetch, path: string) =>
  (body: unknown, signal?: AbortSignal): Promise<Response> =>
    f(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });

/** Kazuist endpoints of the protocol; the key is never part of these requests. */
export function kazuistDeps(f: Fetch = (i, init) => fetch(i, init)): ByokClientDeps {
  return {
    prepare: postJson(f, '/api/v1/answers/prepare'),
    verify: postJson(f, '/api/v1/answers/verify'),
  };
}

export interface ByokOzetInput {
  q: string;
  /** Search filters of the results page (PrepareRequest.filters), the same as the platform summary sends. */
  filters?: AnswerFilters;
  settings: ByokSettings;
  emit: (ev: AnswerEvent) => void;
  signal?: AbortSignal;
  deps?: ByokClientDeps;
  now?: Date;
}

export interface ByokOzetResult {
  /** Sentence indexes the server's verify rejected after the browser had shown them. */
  removed: number[];
}

/** Same machine readable reasons as casuist abstainReason. */
function reason(v: LineValidator): string {
  const s = v.summary();
  if (s.dropped > 0) return 'dogrulanamadi';
  if (s.sawInsufficient) return 'kaynak_yetersiz';
  return 'cikti_yok';
}

export async function byokOzet(input: ByokOzetInput): Promise<ByokOzetResult> {
  const { emit } = input;
  let validator: LineValidator | null = null;
  let lineNo = 0;
  const sentenceOfLine = new Map<number, number>();
  let removed: number[] = [];

  for await (const ev of runByokClient(
    {
      q: input.q,
      settings: input.settings,
      ...(input.filters ? { filters: input.filters } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    input.deps ?? kazuistDeps(),
  )) {
    if (ev.t === 'hazir') {
      validator = createLineValidator(passagesFromPrompt(ev.bundle.prompt), { now: input.now ?? new Date() });
      emit({ t: 'kaynaklar', kaynaklar: ev.bundle.sources });
      emit({ t: 'uyari', kod: 'sabit_fr19', metin: ozet.sabitUyari, cumleIndex: null });
      emit({ t: 'uyari', kod: 'sabit_fr20', metin: ozet.danismanlikUyarisi, cumleIndex: null });
    } else if (ev.t === 'satir' && validator) {
      const at = ev.line === null ? -1 : lineNo++;
      const verdict = await validator.check(ev.line ?? '');
      if (!verdict.ok || verdict.kind !== 'cumle') continue;
      const s = verdict.sentence;
      sentenceOfLine.set(at, s.index);
      emit({
        t: 'cumle',
        index: s.index,
        metin: s.metin,
        kaynaklar: s.kaynaklar,
        alinti: s.alinti,
        destekleyici: s.destekleyici,
      });
      const texts = {
        veri_gunu: ozet.uyari.veriGunu,
        guncellik: ozet.uyari.guncellik,
        destekleyici_kaynak: ozet.uyari.destekleyici,
      };
      for (const w of s.warnings) emit({ t: 'uyari', kod: w, metin: texts[w], cumleIndex: s.index });
    } else if (ev.t === 'dogrulama' && ev.results) {
      removed = ev.results
        .filter((r) => !r.ok && sentenceOfLine.has(r.index))
        .map((r) => sentenceOfLine.get(r.index) as number);
    }
  }

  const summary = validator?.summary();
  const kept = (summary?.accepted ?? 0) - removed.length;
  if (kept <= 0)
    emit({ t: 'cekimser', metin: ozet.cekimser, neden: validator ? reason(validator) : 'cikti_yok' });
  emit({
    t: 'son',
    requestId: 'byok',
    creditsCharged: 0,
    droppedLines: (summary?.dropped ?? 0) + removed.length,
  });
  return { removed };
}
