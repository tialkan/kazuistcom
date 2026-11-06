import type { Chunk } from './types.ts';

export interface ChunkOptions {
  /** Target passage size in characters. */
  max?: number;
  /** Passages shorter than this are merged with the next paragraph. */
  min?: number;
}

/** Sentence ends that are not abbreviations such as "m.", "E.", "K.", "s.", "vd.". */
const SENTENCE_END =
  /(?<!(?<![\p{L}])(?:\p{L}|md|vd|bkz|age|dn|no|art|sy|syf|vb|vs|örn|ör|T\.C))[.!?;:](?=\s+[\p{Lu}(“"0-9])/gu;

function splitLong(text: string, start: number, max: number): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let from = 0;
  while (text.length - from > max) {
    const window = text.slice(from, from + max);
    let cut = -1;
    for (const m of window.matchAll(SENTENCE_END)) if ((m.index ?? 0) > max * 0.4) cut = (m.index ?? 0) + 1;
    if (cut < 0) {
      const space = window.lastIndexOf(' ');
      cut = space > max * 0.4 ? space : max;
    }
    out.push({ text: text.slice(from, from + cut).trim(), start: start + from });
    from += cut;
    while (text[from] === ' ') from++;
  }
  if (from < text.length) out.push({ text: text.slice(from).trim(), start: start + from });
  return out;
}

/**
 * Splits a servable text into passages (chunks table rows): paragraphs are kept whole when they fit, merged
 * when short and split at sentence ends when long. charStart and charEnd index into `text`, so a quote can be
 * highlighted in the full record (FR-82).
 */
export function chunkText(recordId: string, text: string, opts: ChunkOptions = {}): Chunk[] {
  const max = opts.max ?? 1200;
  const min = opts.min ?? 200;
  const paragraphs: { text: string; start: number }[] = [];
  const re = /[^\n]+/g;
  for (const m of text.matchAll(re)) {
    const t = m[0].trim();
    if (!t) continue;
    const start = (m.index ?? 0) + m[0].indexOf(t);
    paragraphs.push(...(t.length > max ? splitLong(t, start, max) : [{ text: t, start }]));
  }
  const merged: { start: number; end: number }[] = [];
  for (const p of paragraphs) {
    const last = merged[merged.length - 1];
    const end = p.start + p.text.length;
    if (last && last.end - last.start < min && end - last.start <= max) last.end = end;
    else merged.push({ start: p.start, end });
  }
  return merged.map((m, seq) => ({
    id: `${recordId}:${seq}`,
    recordId,
    seq,
    section: null,
    text: text.slice(m.start, m.end),
    charStart: m.start,
    charEnd: m.end,
  }));
}
