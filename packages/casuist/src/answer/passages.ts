import type { AuthorityClass, RecordStatus, RecordType, SourceChip } from '@kazuist/contracts';
import type { SearchBackend } from '../backend.ts';
import type { ParsedQuery } from '../query.ts';
import type { RankedRecord } from '../search.ts';
import type { Chunk, CorpusRecord } from '../types.ts';
import type { ValidatorPassage } from './validator.ts';

/** A passage of the sourced summary prompt (plan 7.4/1, Ek D.1 passage format). */
export interface PromptPassage extends ValidatorPassage {
  /** Prompt local id "K1".."Kn". */
  id: string;
  recordId: string;
  /** chunks.id, or `<recordId>:<seq>` for a passage built on the fly; with recordId it names the passage. */
  chunkId: string;
  title: string;
  type: RecordType;
  authority: AuthorityClass;
  status: RecordStatus;
  date: string | null;
  /** yyyy-mm-dd of fetchedAt, the veri_gunu attribute. */
  dataDay: string;
  /** Künye line plus the passage text; this exact text is what the model sees and what quotes are checked in. */
  text: string;
  /** Offsets of the passage body in the full record text, for "Dayanağı göster" (FR-82). */
  charStart: number;
  charEnd: number;
  sourceUrl: string;
}

export interface SelectOptions {
  /** Records used (SRS FR-16: 10 to 20). */
  records?: number;
  /** Extra passages for the first few records. */
  secondPassageFor?: number;
  /** Character budget for all passage texts; plan 8.6 input limit is 12.000 tokens for the standard summary. */
  maxChars?: number;
  maxPassageChars?: number;
}

export const STANDARD_SELECTION: Required<SelectOptions> = {
  records: 10,
  secondPassageFor: 3,
  maxChars: 24_000,
  maxPassageChars: 1_600,
};
export const DEEP_SELECTION: Required<SelectOptions> = {
  records: 20,
  secondPassageFor: 5,
  maxChars: 42_000,
  maxPassageChars: 1_800,
};

const fmtDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : null;
};

/** Citation line (künye) put above every passage, so numbers in the citation are part of the checked text. */
export function kunye(r: CorpusRecord): string {
  if (r.type === 'mevzuat') {
    const no = r.normRefs[0]?.kanunNo;
    return no && /^\d+$/.test(no) && !r.title.includes(no) ? `${no} sayılı ${r.title}` : r.title;
  }
  const date = fmtDate(r.date);
  return date && !r.title.includes(date) ? `${r.title} T. ${date}` : r.title;
}

const clip = (s: string, max: number): string => {
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(' ', max);
  return s.slice(0, cut > max * 0.6 ? cut : max);
};

/**
 * The passage of one chunk as it goes into the prompt: künye line, then the clipped chunk text. selectPassages
 * and loadPromptPassages both build it here, so a reloaded passage is byte for byte the selected one.
 */
export function promptPassage(id: string, r: CorpusRecord, c: Chunk, maxPassageChars: number): PromptPassage {
  const body = clip(c.text, maxPassageChars);
  return {
    id,
    recordId: r.id,
    chunkId: c.id,
    title: r.title,
    type: r.type,
    authority: r.authorityClass,
    status: r.status,
    date: r.date,
    fetchedAt: r.fetchedAt,
    dataDay: r.fetchedAt.slice(0, 10),
    text: `${kunye(r)}\n${body}`,
    charStart: c.charStart,
    charEnd: c.charStart + body.length,
    sourceUrl: r.sourceUrl,
  };
}

/**
 * Picks the 10 to 20 most relevant records and their best passages, wraps each with id, type, authority class,
 * status and dates (plan 7.4/1). Order follows relevance.
 */
export async function selectPassages(
  ranked: RankedRecord[],
  q: ParsedQuery,
  backend: SearchBackend,
  opts: SelectOptions = {},
  embedding?: number[] | null,
): Promise<PromptPassage[]> {
  const o = { ...STANDARD_SELECTION, ...opts };
  const top = [...ranked]
    .sort((a, b) => Number(b.identity) - Number(a.identity) || b.relevance - a.relevance)
    .slice(0, o.records);
  const extraIds = top.slice(0, o.secondPassageFor).map((r) => r.record.id);
  const chunks = await backend.passages(
    q,
    top.map((r) => r.record.id),
    2,
    embedding,
  );
  const byRecord = new Map<string, Chunk[]>();
  for (const c of chunks) byRecord.set(c.recordId, [...(byRecord.get(c.recordId) ?? []), c]);

  const out: PromptPassage[] = [];
  let budget = o.maxChars;
  for (const r of top) {
    const own = byRecord.get(r.record.id) ?? [];
    const first = r.chunk ?? own[0] ?? null;
    const list = [
      first,
      ...(extraIds.includes(r.record.id) ? own.filter((c) => c.id !== first?.id).slice(0, 1) : []),
    ];
    for (const c of list) {
      if (!c) continue;
      const p = promptPassage(`K${out.length + 1}`, r.record, c, o.maxPassageChars);
      if (p.text.length > budget) break;
      budget -= p.text.length;
      out.push(p);
    }
  }
  return out;
}

/** A passage named by a signed BYOK bundle. */
export interface PassageRef {
  id: string;
  recordId: string;
  chunkId: string;
}

/**
 * Reloads the passages a bundle names from the store (servable records only) and rebuilds them exactly as
 * selectPassages did, in the bundle's order. A record or chunk that is gone, hidden or no longer belongs to that
 * record is left out, so the caller's comparison with the signed list fails closed.
 */
export async function loadPromptPassages(
  backend: SearchBackend,
  refs: readonly PassageRef[],
  opts: SelectOptions = {},
): Promise<PromptPassage[]> {
  const o = { ...STANDARD_SELECTION, ...opts };
  if (!refs.length) return [];
  const [recs, chunks] = await Promise.all([
    backend.records([...new Set(refs.map((r) => r.recordId))]),
    backend.chunks([...new Set(refs.map((r) => r.chunkId))]),
  ]);
  const recById = new Map(recs.map((r) => [r.id, r]));
  const chunkById = new Map(chunks.map((c) => [c.id, c]));
  const out: PromptPassage[] = [];
  for (const ref of refs) {
    const r = recById.get(ref.recordId);
    const c = chunkById.get(ref.chunkId);
    if (!r || !c || c.recordId !== r.id) continue;
    out.push(promptPassage(ref.id, r, c, o.maxPassageChars));
  }
  return out;
}

/** Source chips for the `kaynaklar` event (kenar şerhi). */
export function sourceChips(passages: readonly PromptPassage[]): SourceChip[] {
  return passages.map((p) => ({
    id: p.id,
    recordId: p.recordId,
    title: p.title,
    authorityClass: p.authority,
    status: p.status,
    date: p.date,
    fetchedAt:
      p.fetchedAt && Number.isFinite(Date.parse(p.fetchedAt)) ? new Date(p.fetchedAt).toISOString() : null,
  }));
}

const ATTR = /(\w+)="([^"]*)"/g;

/**
 * Reads the passages back from a signed prompt (Ek D.1 format) for /v1/answers/verify. The prompt is trusted
 * because its HMAC was checked; the passage text is exactly what the model saw.
 */
export function passagesFromPrompt(prompt: string): ValidatorPassage[] {
  const out: ValidatorPassage[] = [];
  for (const m of prompt.matchAll(/<kaynak ([^>]*)>\n([\s\S]*?)\n<\/kaynak>/g)) {
    const attrs = Object.fromEntries([...(m[1] ?? '').matchAll(ATTR)].map((a) => [a[1], a[2]]));
    if (!attrs.id) continue;
    out.push({
      id: attrs.id,
      text: m[2] ?? '',
      authority: (attrs.otorite ?? 'emsal_sinirli') as AuthorityClass,
      status: (attrs.durum ?? 'bilinmiyor') as RecordStatus,
      fetchedAt: attrs.veri_gunu ? `${attrs.veri_gunu}T00:00:00.000Z` : null,
    });
  }
  return out;
}
