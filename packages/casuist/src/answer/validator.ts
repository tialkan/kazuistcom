import { parseModelLine, type AuthorityClass, type ModelLine, type RecordStatus } from '@kazuist/contracts';
import { isBinding } from '../authority.ts';
import { NON_BINDING_SECTIONS } from '../chunk.ts';
import { normalize, wordCount } from '../normalize.ts';
import { heuristicNames, type NameDetector } from './names.ts';
import { negationMismatch, quotedSpan } from './negation.ts';
import { quantities, quantityBacked } from './quantities.ts';

/** Ek D limits. */
export const MAX_SENTENCES = 3;
export const MAX_WORDS = 70;
/**
 * Shortest quote, normalised characters. Plan 7.4/3 and Ek D.2/b set a floor of 12; 20 is used because on the
 * 50 question set (eval/rag/alinti.ts, raporlar/alinti-esigi.md) the share of shortest valid quotes that also occur
 * in another passage of the same prompt falls from 14.5% at 12 to 6.6% at 20 (the knee; 5.1% at 24, 3.8% at 32),
 * while the only passages that become unquotable are stray heading lines such as "III. Tazminat".
 */
export const MIN_QUOTE_CHARS = 20;
/** Ek D.2/e: data older than this many days triggers the Veri günü warning on time bound wording. */
export const STALE_DAYS = 7;

/** A passage as the model saw it, with the metadata the validator needs. */
export interface ValidatorPassage {
  id: string;
  /** Künye line plus body, exactly as in the prompt; numbers are checked against all of it. */
  text: string;
  /**
   * The passage body without the künye line. Quotes must come from here: the citation line proves nothing about
   * the content. Defaults to `text` when absent.
   */
  body?: string;
  authority: AuthorityClass;
  status: RecordStatus;
  /** ISO date-time of the fetch (Veri günü). */
  fetchedAt: string | null;
  /** Decision section of the passage (chunks.section); iddia, surec and karsi_oy never bind on their own. */
  section?: string | null;
}

/** Record states that always carry the Güncellik warning (Ek D.1 rule 7, plan 7.2/5 status penalty). */
export const OUTDATED_STATUSES: ReadonlySet<RecordStatus> = new Set<RecordStatus>([
  'degisti',
  'yururlukten_kalkti',
  'bozuldu',
]);

/** Binding for plan 7.4/6: a binding authority class, and not a party's claim, the history or a dissent. */
export const bindingPassage = (p: Pick<ValidatorPassage, 'authority' | 'section'>): boolean =>
  isBinding(p.authority) && !(p.section && NON_BINDING_SECTIONS.has(p.section));

export type RejectReason =
  | 'gecersiz_satir'
  | 'kaynak_yok'
  | 'bilinmeyen_kaynak'
  | 'alinti_eksik'
  | 'alinti_kisa'
  | 'alinti_bulunamadi'
  | 'olumsuzluk'
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
 * such as "11/1-c", amounts and plain numbers. Each token is matched with digit boundaries. Numbers written in
 * words are covered by `quantities` (quantities.ts).
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
  const byId = new Map(
    passages.map((p) => [p.id, { ...p, norm: normalize(p.text), quotable: normalize(p.body ?? p.text) }]),
  );

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
    // b. a verbatim quote of at least MIN_QUOTE_CHARS characters per source, found in the body of that passage
    // (not in its künye line) after normalisation.
    const alinti: Record<string, string> = {};
    const spans: string[] = [];
    for (const k of ids) {
      const q = line.alinti[k];
      if (typeof q !== 'string' || !q.trim()) return reject('alinti_eksik');
      const nq = normalize(q);
      if (nq.length < minQuote) return reject('alinti_kisa');
      const quotable = byId.get(k)?.quotable ?? '';
      if (!quotable.includes(nq)) return reject('alinti_bulunamadi');
      alinti[k] = q;
      spans.push(quotedSpan(quotable, nq));
    }
    // c. every number, date, esas and karar number and article reference appears in a cited passage; a quantity
    // (number with a unit, in digits or words) needs the same value and unit there.
    const metin = normalize(line.metin);
    const cited = ids.map((k) => byId.get(k)?.norm ?? '').join('\n');
    const citedQ = quantities(cited);
    const ownQ = quantities(metin);
    if (ownQ.some((q) => !quantityBacked(q, citedQ))) return reject('dayanaksiz_sayi');
    // Every quantity is backed by now, so "15 gün" may stand for the passage's "on beş gün".
    const backedAsQuantity = (t: string): boolean => ownQ.some((q) => q.form === 'rakam' && q.text === t);
    if (numericTokens(line.metin).some((t) => !containsToken(cited, t) && !backedAsQuantity(t)))
      return reject('dayanaksiz_sayi');
    // d. no unmasked person name.
    if ((await names.find(line.metin)).length) return reject('kisi_adi');
    // d2. the sentence keeps the polarity of what it quotes: no dropped or added negation (değil, -maz/-mez,
    // -madan, -maksızın ...). Checked after names, since surnames such as "Yılmaz" look negated.
    if (negationMismatch(metin, spans)) return reject('olumsuzluk');
    // f. at most 3 sentences and 70 words in total; an over limit sentence is dropped.
    if (state.accepted >= maxSentences) return reject('cumle_siniri');
    const words = wordCount(line.metin);
    if (state.words + words > maxWords) return reject('kelime_siniri');
    // e. time bound wording needs an in force source with fresh data, otherwise a warning is attached. A source
    // that changed, was repealed or reversed carries the Güncellik warning whatever the wording (Ek D.1 rule 7).
    const warnings: WarningCode[] = [];
    const sources = ids.map((k) => byId.get(k)).filter((p) => p !== undefined);
    const timeBound = hasTimeBoundWording(line.metin);
    if (timeBound && sources.some((p) => stale(p.fetchedAt, now, staleDays))) warnings.push('veri_gunu');
    if (
      sources.some((p) => OUTDATED_STATUSES.has(p.status)) ||
      (timeBound && sources.some((p) => p.status !== 'yururlukte'))
    )
      warnings.push('guncellik');
    // plan 7.4/6: a holding not built on a binding source is shown as supporting only. A claim, the procedural
    // history or a dissent of a binding decision does not bind (chunks.section).
    const destekleyici = !sources.some(bindingPassage);
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
