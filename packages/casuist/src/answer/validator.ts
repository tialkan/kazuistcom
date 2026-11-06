import { parseModelLine, type AuthorityClass, type ModelLine, type RecordStatus } from '@kazuist/contracts';
import { isBinding } from '../authority.ts';
import { normalize, wordCount } from '../normalize.ts';
import { heuristicNames, type NameDetector } from './names.ts';

/** Ek D limits. */
export const MAX_SENTENCES = 3;
export const MAX_WORDS = 70;
export const MIN_QUOTE_CHARS = 12;
/** Ek D.2/e: data older than this many days triggers the Veri günü warning on time bound wording. */
export const STALE_DAYS = 7;

/** A passage as the model saw it, with the metadata the validator needs. */
export interface ValidatorPassage {
  id: string;
  text: string;
  authority: AuthorityClass;
  status: RecordStatus;
  /** ISO date-time of the fetch (Veri günü). */
  fetchedAt: string | null;
}

export type RejectReason =
  | 'gecersiz_satir'
  | 'kaynak_yok'
  | 'bilinmeyen_kaynak'
  | 'alinti_eksik'
  | 'alinti_kisa'
  | 'alinti_bulunamadi'
  | 'dayanaksiz_sayi'
  | 'kisi_adi'
  | 'cumle_siniri'
  | 'kelime_siniri'
  | 'son_sonrasi';

export type WarningCode = 'veri_gunu' | 'guncellik' | 'destekleyici_kaynak';

export interface AcceptedSentence {
  index: number;
  metin: string;
  kaynaklar: string[];
  alinti: Record<string, string>;
  destekleyici: boolean;
  warnings: WarningCode[];
}

export type LineVerdict =
  | { ok: true; kind: 'cumle'; sentence: AcceptedSentence }
  | { ok: true; kind: 'yetersiz' }
  | { ok: true; kind: 'son' }
  | { ok: false; reason: RejectReason };

export interface ValidatorOptions {
  now?: Date;
  names?: NameDetector;
  maxSentences?: number;
  maxWords?: number;
  minQuoteChars?: number;
  staleDays?: number;
}

export interface ValidatorSummary {
  accepted: number;
  dropped: number;
  words: number;
  reasons: Partial<Record<RejectReason, number>>;
  sawInsufficient: boolean;
  ended: boolean;
  /** Ek D.2/4: no valid sentence at the end of the stream. */
  abstained: boolean;
}

/**
 * Numbers that must be backed by a cited passage (Ek D.2/c): dates, esas and karar numbers, article references
 * such as "11/1-c", amounts and plain numbers. Each token is matched with digit boundaries.
 */
export function numericTokens(text: string): string[] {
  const n = normalize(text);
  const found = n.match(/\d+(?:[./-]\d+)*(?:-[a-zçğıöşü](?![\p{L}]))?/gu) ?? [];
  return [...new Set(found.map((t) => t.replace(/[.]$/, '')))];
}

function containsToken(haystack: string, token: string): boolean {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{N}])${esc}(?![\\p{N}])`, 'u').test(haystack);
}

/** Ek D.2/e time bound wording (Turkish and English). */
const TIME_BOUND =
  /(?<![\p{L}])(?:yürürlükte(?:dir|ki)?|hâlen|halen|güncel(?:dir)?|artık|henüz|bugün(?:kü)?|currently|in force|still|today|as of now)(?![\p{L}])/u;

export function hasTimeBoundWording(text: string): boolean {
  return TIME_BOUND.test(normalize(text));
}

function stale(fetchedAt: string | null, now: Date, days: number): boolean {
  if (!fetchedAt) return true;
  const at = Date.parse(fetchedAt);
  return !Number.isFinite(at) || now.getTime() - at > days * 86_400_000;
}

/**
 * Line validator of plan 7.4/3 and Ek D.2. Pure; the same build runs on the server (platform and BYOK relay,
 * /v1/answers/verify) and in the browser (BYOK client mode). Feed lines in stream order; rejected lines are never
 * shown and only their reason is counted.
 */
export function createLineValidator(passages: readonly ValidatorPassage[], opts: ValidatorOptions = {}) {
  const now = opts.now ?? new Date();
  const names = opts.names ?? heuristicNames;
  const maxSentences = opts.maxSentences ?? MAX_SENTENCES;
  const maxWords = opts.maxWords ?? MAX_WORDS;
  const minQuote = opts.minQuoteChars ?? MIN_QUOTE_CHARS;
  const staleDays = opts.staleDays ?? STALE_DAYS;
  const byId = new Map(passages.map((p) => [p.id, { ...p, norm: normalize(p.text) }]));

  const state: ValidatorSummary = {
    accepted: 0,
    dropped: 0,
    words: 0,
    reasons: {},
    sawInsufficient: false,
    ended: false,
    abstained: true,
  };
  const reject = (reason: RejectReason): LineVerdict => {
    state.dropped++;
    state.reasons[reason] = (state.reasons[reason] ?? 0) + 1;
    return { ok: false, reason };
  };

  async function check(input: string | ModelLine): Promise<LineVerdict> {
    if (state.ended) return reject('son_sonrasi');
    const line = typeof input === 'string' ? parseModelLine(input.trim()) : input;
    if (!line) return reject('gecersiz_satir');
    if (line.t === 'son') {
      state.ended = true;
      return { ok: true, kind: 'son' };
    }
    if (line.t === 'yetersiz') {
      state.sawInsufficient = true;
      return { ok: true, kind: 'yetersiz' };
    }
    // a. sources present and all within the retrieved set.
    const ids = [...new Set(line.kaynaklar)];
    if (!ids.length) return reject('kaynak_yok');
    if (ids.some((k) => !byId.has(k))) return reject('bilinmeyen_kaynak');
    // b. a verbatim quote of at least 12 characters per source, found in that passage after normalisation.
    const alinti: Record<string, string> = {};
    for (const k of ids) {
      const q = line.alinti[k];
      if (typeof q !== 'string' || !q.trim()) return reject('alinti_eksik');
      const nq = normalize(q);
      if (nq.length < minQuote) return reject('alinti_kisa');
      if (!byId.get(k)?.norm.includes(nq)) return reject('alinti_bulunamadi');
      alinti[k] = q;
    }
    // c. every number, date, esas and karar number and article reference appears in a cited passage.
    const cited = ids.map((k) => byId.get(k)?.norm ?? '').join('\n');
    if (numericTokens(line.metin).some((t) => !containsToken(cited, t))) return reject('dayanaksiz_sayi');
    // d. no unmasked person name.
    if ((await names.find(line.metin)).length) return reject('kisi_adi');
    // f. at most 3 sentences and 70 words in total; an over limit sentence is dropped.
    if (state.accepted >= maxSentences) return reject('cumle_siniri');
    const words = wordCount(line.metin);
    if (state.words + words > maxWords) return reject('kelime_siniri');
    // e. time bound wording needs an in force source with fresh data, otherwise a warning is attached.
    const warnings: WarningCode[] = [];
    const sources = ids.map((k) => byId.get(k)).filter((p) => p !== undefined);
    if (hasTimeBoundWording(line.metin)) {
      if (sources.some((p) => stale(p.fetchedAt, now, staleDays))) warnings.push('veri_gunu');
      if (sources.some((p) => p.status !== 'yururlukte')) warnings.push('guncellik');
    }
    // plan 7.4/6: a holding not built on a binding source is shown as supporting only.
    const destekleyici = !sources.some((p) => isBinding(p.authority));
    if (destekleyici) warnings.push('destekleyici_kaynak');
    const sentence: AcceptedSentence = {
      index: state.accepted,
      metin: line.metin,
      kaynaklar: ids,
      alinti,
      destekleyici,
      warnings,
    };
    state.accepted++;
    state.words += words;
    state.abstained = false;
    return { ok: true, kind: 'cumle', sentence };
  }

  return {
    check,
    summary: (): ValidatorSummary => ({ ...state, reasons: { ...state.reasons } }),
  };
}

export type LineValidator = ReturnType<typeof createLineValidator>;
