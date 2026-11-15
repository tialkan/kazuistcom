/**
 * Negation for the line validator: a sentence must not drop or add a negation relative to the passage span it
 * quotes ("işlenemez" quoted, "işlenebilir" written). Turkish negates verbs with a suffix, so the check works on
 * word endings: -mA- followed by a tense, mood or participle ending (-maz/-mez, -madı, -mamış, -mayan, -mayacak,
 * -madan, -maksızın, -madıkça, -mayıp, -maması, -mamak, ...), plus "değil" and "yok". The vowel of -mA- must follow
 * vowel harmony with the stem, which keeps nouns such as "kararname" or "komedi" out. Pure and browser safe;
 * input is expected in normalize() form (tr-TR lower case).
 */

const BACK = 'aıouâû';
const FRONT = 'eiöüî';
const VOWELS = new Set([...BACK, ...FRONT]);

/**
 * Endings after the -mA- morpheme, anchored at the end of the word. -mAzlIk nouns ("uyuşmazlık" dispute,
 * "anlaşmazlık") are lexicalised and left out.
 */
const AFTER_MA =
  /^(?:z(?!l[ıiuü][kğ])\p{L}{0,8}|d[ıiuü](?:ğ\p{L}*|k\p{L}*|r|l[ae]r\p{L}*|ys[ae]\p{L}*)?|m[ıiuü]ş\p{L}*|y[ae]n\p{L}*|y[ae]c[ae][kğ]\p{L}*|y[ae]r[ae]k|y[ıi]p|ks[ıi]z[ıi]n|d[ae]n|m[ae](?:s|k|l|y|d[ae]n)\p{L}*)$/u;

/** Words that look negated but are not (vowel harmony alone does not exclude them). */
const NOT_NEGATION = /^(?:ramazan|namaz|hükmeden|mutemed)/u;

export interface NegatedWord {
  word: string;
  /** The word before -mA- (with the abilitative vowel, "işlene" of "işlenemez"); empty for değil and yok. */
  stem: string;
}

function lastVowel(s: string): string | null {
  for (let i = s.length - 1; i >= 0; i--) if (VOWELS.has(s[i] ?? '')) return s[i] ?? null;
  return null;
}

/** The stem of a negated verb form, or null when the word is not a negated verb. */
export function negatedStem(word: string): string | null {
  if (NOT_NEGATION.test(word)) return null;
  for (let i = 2; i < word.length - 1; i++) {
    if (word[i] !== 'm') continue;
    const v = word[i + 1];
    if (v !== 'a' && v !== 'e') continue;
    const stem = word.slice(0, i);
    const prev = lastVowel(stem);
    if (!prev || (v === 'a') !== BACK.includes(prev)) continue;
    if (AFTER_MA.test(word.slice(i + 2))) return stem;
  }
  return null;
}

const WORD = /[\p{L}]+/gu;

/**
 * Negated words of a normalised text. "işlenip işlenmediğini" (whether or not) is a question, not a negation:
 * a negated form right after the -Ip form of the same stem is skipped. "yok et-", "yok edil-", "yok say-" and
 * "yok hükmünde" are not negations either.
 */
export function negations(normalized: string): NegatedWord[] {
  const words = [...normalized.matchAll(WORD)].map((m) => m[0]);
  const out: NegatedWord[] = [];
  words.forEach((w, i) => {
    const next = words[i + 1] ?? '';
    if (w.startsWith('değil')) out.push({ word: w, stem: '' });
    else if (/^yok(?:tur|tu|sa|ken)?$/u.test(w)) {
      if (!/^(?:et|ed|say|hükm)/u.test(next)) out.push({ word: w, stem: '' });
    } else {
      const stem = negatedStem(w);
      if (stem === null) return;
      const prev = words[i - 1] ?? '';
      const base = stem.replace(/y?[ae]$/u, '');
      if (base.length >= 2 && prev.startsWith(base) && /[ıiuü]p$/u.test(prev)) return;
      out.push({ word: w, stem });
    }
  });
  return out;
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Positive "can" or aorist form of a stem: "işlene" or "işlen" to "işlenebilir" and "işlenir", "uygulan" to
 * "uygulanır", "düzenle" to "düzenleyebilir". Polysyllabic stems take the aorist with a high vowel, so "veriler"
 * (data) is not read as a form of "veril-"; the "-r" aorist of vowel stems is left out for the same reason.
 */
function positiveOf(stem: string, words: readonly string[]): boolean {
  const base = stem.replace(/y?[ae]$/u, '');
  if (base.length < 4) return false;
  const re = new RegExp(
    `^(?:${esc(stem)}|${esc(base)})(?:(?:y?[ae])?bil|[ıiuü]r(?:$|d[ıiuü]r|l[ae]r|s[ae]|k[ae]n))`,
    'u',
  );
  return words.some((w) => re.test(w) && negatedStem(w) === null);
}

export type NegationMismatch = 'eksik' | 'fazla' | null;

/**
 * Compares a sentence with the spans it quotes. "eksik": a quote is negated and the sentence is not, or the
 * sentence turns a negated verb of a quote into its positive form; "fazla": the reverse. null when they agree.
 */
export function negationMismatch(sentence: string, quotes: readonly string[]): NegationMismatch {
  const s = negations(sentence);
  const q = quotes.flatMap((x) => negations(x));
  if (q.length && !s.length) return 'eksik';
  if (s.length && !q.length) return 'fazla';
  const sWords = [...sentence.matchAll(WORD)].map((m) => m[0]);
  const qWords = quotes.flatMap((x) => [...x.matchAll(WORD)].map((m) => m[0]));
  // A verb negated on one side and only positive on the other (both forms on a side keep it consistent).
  const base = (n: NegatedWord): string => n.stem.replace(/y?[ae]$/u, '');
  const flipped = (n: NegatedWord, words: readonly string[], other: readonly NegatedWord[]): boolean =>
    n.stem !== '' && positiveOf(n.stem, words) && !other.some((o) => o.stem && base(o) === base(n));
  if (q.some((n) => flipped(n, sWords, s))) return 'eksik';
  if (s.some((n) => flipped(n, qWords, q))) return 'fazla';
  return null;
}

/**
 * The quoted span as it stands in the passage, extended to the end of its last word and over a following
 * "değil" or "yok", so that a quote cut just before the negation ("rıza zorunlu" of "rıza zorunlu değildir")
 * keeps it. `passage` and `quote` are normalised; returns the quote when it is not found.
 */
export function quotedSpan(passage: string, quote: string): string {
  const at = passage.indexOf(quote);
  if (at < 0) return quote;
  let end = at + quote.length;
  while (end < passage.length && /\p{L}/u.test(passage[end] ?? '')) end++;
  const next = /^[\s,]+([\p{L}]+)/u.exec(passage.slice(end));
  if (next && /^(?:değil|yok(?:tur|tu|sa|ken)?$)/u.test(next[1] ?? '')) end += next[0].length;
  return passage.slice(at, end);
}
