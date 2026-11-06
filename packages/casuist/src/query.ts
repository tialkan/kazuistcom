import { resolveDecisions, type DecisionRef } from './decisions.ts';
import { normalize, terms } from './normalize.ts';
import { resolveNorms, type ResolvedNorm } from './norms.ts';

export interface ParsedQuery {
  raw: string;
  normalized: string;
  /** Stemmed, stop words removed, unique, in order. */
  terms: string[];
  norms: ResolvedNorm[];
  decisions: DecisionRef[];
  lang: 'tr' | 'en';
}

const TR_HINT =
  /[çğıöşüâî]|(?<![\p{L}])(?:ve|ile|bir|nedir|hangi|nasil|madde|kanun|karar|hakki|sartlari)(?![\p{L}])/u;
const EN_HINT =
  /(?<![\p{L}])(?:the|what|which|how|is|are|of|right|data|article|regulation|court)(?![\p{L}])/u;

/** Language of the question (plan 7.1/3); Turkish unless only English cues are present. */
export function detectLanguage(q: string): 'tr' | 'en' {
  const n = normalize(q);
  if (TR_HINT.test(n)) return 'tr';
  return EN_HINT.test(n) ? 'en' : 'tr';
}

/** Query analysis of plan 7.1: normalisation, norm and decision references, terms and language. */
export function parseQuery(q: string): ParsedQuery {
  return {
    raw: q,
    normalized: normalize(q),
    terms: [...new Set(terms(q))],
    norms: resolveNorms(q),
    decisions: resolveDecisions(q),
    lang: detectLanguage(q),
  };
}
