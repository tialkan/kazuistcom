/**
 * Gemini free tier rule (plan 8.4). Free tier content may be used for product improvement and
 * human review, so operations that send unpublished drafts or Kampus files are closed there
 * unless the user explicitly opts in.
 */
export type GeminiBilling = 'ucretli' | 'ucretsiz' | 'bilinmiyor';

export type ContentSensitivity = 'kamu_kaynak' | 'yayimlanmamis_taslak' | 'kampus_dosyasi';

export interface GeminiDecision {
  allowed: boolean;
  /** Show the free tier warning (i18n key lives with the web app). */
  warn: boolean;
  reason?: 'ucretsiz_katman_hassas_icerik';
}

/** Unknown billing is treated as free (plan 8.4/1). */
export function geminiFreeTier(billing: GeminiBilling): boolean {
  return billing !== 'ucretli';
}

export function geminiPolicy(
  billing: GeminiBilling,
  content: ContentSensitivity,
  explicitOptIn = false,
): GeminiDecision {
  if (!geminiFreeTier(billing)) return { allowed: true, warn: false };
  if (content === 'kamu_kaynak') return { allowed: true, warn: true };
  if (explicitOptIn) return { allowed: true, warn: true };
  return { allowed: false, warn: true, reason: 'ucretsiz_katman_hassas_icerik' };
}
