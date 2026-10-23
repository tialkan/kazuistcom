/**
 * Gemini BYOK rule (plan 8.4 as narrowed by docs/kararlar.md, 2026-10-22). Under the Gemini API
 * Additional Terms, free tier content may be used for product improvement and human review. A
 * Gemini key is therefore accepted only when the user declares paid billing; without that
 * declaration Gemini BYOK is closed for every operation.
 */
export type GeminiBilling = 'ucretli' | 'ucretsiz' | 'bilinmiyor';

/** Kind of content an operation sends; kept for callers, no longer changes the Gemini decision. */
export type ContentSensitivity = 'kamu_kaynak' | 'yayimlanmamis_taslak' | 'kampus_dosyasi';

export interface GeminiDecision {
  allowed: boolean;
  reason?: 'ucretli_faturalandirma_beyani_yok';
}

/** Anything but a paid billing declaration counts as free tier. */
export function geminiFreeTier(billing: GeminiBilling): boolean {
  return billing !== 'ucretli';
}

export function geminiPolicy(billing: GeminiBilling): GeminiDecision {
  return geminiFreeTier(billing)
    ? { allowed: false, reason: 'ucretli_faturalandirma_beyani_yok' }
    : { allowed: true };
}
