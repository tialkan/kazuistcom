import type { Operation } from './types.ts';

/** Model IDs from https://platform.claude.com/docs/en/about-claude/models/overview (checked 2026-10-19). */
export const MODELS = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
} as const;

/** USD per million tokens, plan 4.4 and Anthropic pricing page (Haiku below 100k prompt tokens). */
export const PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  [MODELS.haiku]: { input: 0.1, output: 0.5 },
  [MODELS.sonnet]: { input: 2, output: 10 },
};

/** Haiku 5.5 switches to a higher price tier above this prompt size (plan 8.6). */
export const HAIKU_TIER_THRESHOLD = 100_000;

export type ByokClass = 'hizli' | 'orta' | null;

export interface Route {
  model: string;
  fallbackModel?: string;
  byokClass: ByokClass;
  maxInputTokens: number;
  maxOutputTokens: number;
  batch?: boolean;
}

/** plan 8.6 */
export const ROUTES: Record<Operation, Route> = {
  ozet: { model: MODELS.haiku, byokClass: 'hizli', maxInputTokens: 12_000, maxOutputTokens: 400 },
  derin_ozet: { model: MODELS.sonnet, byokClass: 'orta', maxInputTokens: 20_000, maxOutputTokens: 1_200 },
  kural_cikarma: {
    model: MODELS.haiku,
    fallbackModel: MODELS.sonnet,
    byokClass: 'orta',
    maxInputTokens: 80_000,
    maxOutputTokens: 3_000,
  },
  kampus_ozet: { model: MODELS.haiku, byokClass: 'hizli', maxInputTokens: 16_000, maxOutputTokens: 800 },
  atif_cikarma: {
    model: MODELS.haiku,
    byokClass: null,
    maxInputTokens: 20_000,
    maxOutputTokens: 1_500,
    batch: true,
  },
  kart_editor: { model: MODELS.sonnet, byokClass: null, maxInputTokens: 6_000, maxOutputTokens: 800 },
  kart_akademisyen: { model: MODELS.haiku, byokClass: 'hizli', maxInputTokens: 3_000, maxOutputTokens: 400 },
};

/** Cheap conservative token estimate (about 3 characters per token for Turkish). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES_USD_PER_MTOK[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
