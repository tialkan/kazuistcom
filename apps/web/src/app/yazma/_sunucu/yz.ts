import type { KisaltmaModeli } from '../_cekirdek/kisaltmalar.ts';
import { kisaltmaIstemi, kisaltmaSistemTalimati, oneriCevabiniAyikla } from '../_cekirdek/kisaltmalar.ts';
import type { KuralModeli } from '../_cekirdek/kural-cikarma.ts';

/**
 * Production binding of the model ports to the AI gateway package (plan 8, ADR-0025). It is closed unless
 * YAZMA_YZ=acik and OPENROUTER_API_KEY are both set. Every prompt goes through the gateway's personal data
 * scrubber first (plan 8.5), calls use the platform OpenRouter route with zero data retention, no tools are
 * sent, and neither prompt nor answer is logged.
 *
 * Open item (docs/istekler/yazma-yz-gecidi.md): the gateway has no general completion entry that applies the
 * budget guard and the credit ledger, so this binding stays off by default until yz-gecidi adds one.
 */

type Env = Record<string, string | undefined>;

export const yzAcikMi = (env: Env = process.env) => env.YAZMA_YZ === 'acik' && !!env.OPENROUTER_API_KEY;

async function tamamla(
  env: Env,
  model: 'haiku' | 'sonnet',
  sistem: string,
  istem: string,
  islem: 'kural_cikarma',
): Promise<string> {
  const key = env.OPENROUTER_API_KEY;
  if (!key) throw new Error('not configured');
  const gw = await import('@kazuist/ai-gateway');
  const rota = gw.ROUTES[islem];
  const maskeli = await gw.scrub(istem);
  try {
    if (gw.estimateTokens(sistem + maskeli.text) > rota.maxInputTokens)
      throw new Error('input exceeds route limit');
    const anthropicModel = model === 'haiku' ? gw.MODELS.haiku : gw.MODELS.sonnet;
    const adapter = gw.openRouterAdapter();
    let cikti = '';
    for await (const parca of adapter.stream(
      {
        provider: 'openrouter',
        model: gw.platformModel('openrouter', anthropicModel),
        system: sistem,
        prompt: maskeli.text,
        maxOutputTokens: rota.maxOutputTokens,
      },
      { apiKey: key, openRouter: { zdr: true } },
    ))
      if (parca.type === 'text') cikti += parca.text;
    return cikti;
  } finally {
    maskeli.mapping.clear();
  }
}

export function kuralModeli(env: Env = process.env): KuralModeli | null {
  if (!yzAcikMi(env)) return null;
  return { tamamla: ({ model, sistem, istem }) => tamamla(env, model, sistem, istem, 'kural_cikarma') };
}

/** Abbreviation suggestions: Haiku, abbreviations only (the text never reaches the model). */
export function kisaltmaModeli(env: Env = process.env): KisaltmaModeli | null {
  if (!yzAcikMi(env)) return null;
  return {
    async oner(kisaltmalar) {
      const ham = await tamamla(
        env,
        'haiku',
        kisaltmaSistemTalimati,
        kisaltmaIstemi(kisaltmalar),
        'kural_cikarma',
      );
      return oneriCevabiniAyikla(ham, kisaltmalar);
    },
  };
}
