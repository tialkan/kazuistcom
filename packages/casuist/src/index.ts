/**
 * Casuist source binding core (plan 7). Pure functions, UI independent. Owner: casuist agent.
 * Wave 0 exposes only the contract types it builds on; implementation lands in Wave 2.
 */
export { ModelLine, parseModelLine } from '@kazuist/contracts';
export const MAX_SENTENCES = 3;
export const MAX_WORDS = 70;
export const MIN_QUOTE_CHARS = 12;
export const RRF_K = 60;
