import type { KisaltmaModeli } from '../_cekirdek/kisaltmalar.ts';
import { kisaltmaIstemi, kisaltmaSistemTalimati, oneriCevabiniAyikla } from '../_cekirdek/kisaltmalar.ts';
import type { KuralModeli, ModelAdi } from '../_cekirdek/kural-cikarma.ts';

/**
 * Production binding of the model ports to the AI gateway (plan 8, ADR-0025, docs/istekler/yazma-yz-gecidi.md).
 * Every call goes through `gateway.complete` of the shared platform gateway (the one the sourced summary uses):
 * the personal data scrubber with the name recogniser (plan 8.5), the per user, per IP and platform TL budget
 * (plan 8.7), the credit hold and its settlement, provider fallback, zero data retention on OpenRouter, a cost
 * event and a metric without content. No tools are sent, and neither prompt nor answer is logged.
 *
 * Closed unless YAZMA_YZ=acik and OPENROUTER_API_KEY are both set.
 */

type Env = Record<string, string | undefined>;

/** plan 4.4 credit prices: template from a guide 30, table of abbreviations 2. */
export const YAZMA_KREDI = { kural_cikarma: 30, kisaltma_oneri: 2 } as const;

/** Who asks; the gateway budgets per user and per IP and holds credits under `istekKimligi`. */
export interface YzKimlik {
  userId: string;
  ip: string;
  /** Idempotency base of the credit hold; the model tier is appended, so a fallback call has its own hold. */
  istekKimligi: string;
  /** Operator measurement only (eval/rules --mod=canli): no credit hold; the platform TL cap still applies. */
  kredisiz?: true;
}

export const yzAcikMi = (env: Env = process.env) => env.YAZMA_YZ === 'acik' && !!env.OPENROUTER_API_KEY;

interface Cagri {
  islem: keyof typeof YAZMA_KREDI;
  model: ModelAdi;
  sistem: string;
  istem: string;
  /** Schema check of the answer; credits are consumed only when it passes (plan 4.5/3). */
  kabul?: (ham: string) => boolean;
}

async function tamamla(kim: YzKimlik, c: Cagri): Promise<string> {
  // Loaded on demand: the gateway wiring needs the server environment (Valkey, ledger, platform keys).
  const { getSummaryDeps, keyedHash } = await import('@/app/ara/_sunucu/gecit');
  const deps = getSummaryDeps();
  const r = await deps.gateway.complete({
    requestId: `yazma:${c.islem}:${kim.istekKimligi}:${c.model}`,
    operation: c.islem,
    mode: 'platform',
    userId: kim.userId,
    userHash: keyedHash(deps.hashSecret, 'kullanici', kim.userId),
    ipHash: keyedHash(deps.hashSecret, 'ip', kim.ip),
    credits: kim.kredisiz ? 0 : YAZMA_KREDI[c.islem],
    free: false,
    system: c.sistem,
    prompt: c.istem,
    modelTier: c.model === 'sonnet' ? 'fallback' : 'primary',
    // The answer is checked against the user's own guide on the server; masked values go back for that check.
    restoreLabels: true,
    ...(c.kabul ? { accept: c.kabul } : {}),
  });
  return r.text;
}

export function kuralModeli(kim: YzKimlik, env: Env = process.env): KuralModeli | null {
  if (!yzAcikMi(env)) return null;
  return {
    tamamla: ({ model, sistem, istem, kabul }) =>
      tamamla(kim, { islem: 'kural_cikarma', model, sistem, istem, ...(kabul ? { kabul } : {}) }),
  };
}

/** Abbreviation suggestions: Haiku, abbreviations only (the text never reaches the model). */
export function kisaltmaModeli(kim: YzKimlik, env: Env = process.env): KisaltmaModeli | null {
  if (!yzAcikMi(env)) return null;
  return {
    async oner(kisaltmalar) {
      const ham = await tamamla(kim, {
        islem: 'kisaltma_oneri',
        model: 'haiku',
        sistem: kisaltmaSistemTalimati,
        istem: kisaltmaIstemi(kisaltmalar),
        kabul: (cevap) => Object.keys(oneriCevabiniAyikla(cevap, kisaltmalar)).length > 0,
      });
      return oneriCevabiniAyikla(ham, kisaltmalar);
    },
  };
}
