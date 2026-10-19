import { parseModelLine, type ModelLine } from '@kazuist/contracts';

export type JsonlItem = { ok: true; line: ModelLine } | { ok: false; reason: 'gecersiz_satir' };

/**
 * Turns a stream of text deltas into Ek D.1 JSON Lines, each checked with the contracts zod schema.
 * Code fences and blank lines are skipped. Invalid lines are reported without their content.
 * Stops after the first `son` line.
 */
export async function* parseJsonLines(chunks: AsyncIterable<string>): AsyncGenerator<JsonlItem> {
  let buffer = '';
  const handle = (raw: string): JsonlItem | null => {
    const line = raw.trim();
    if (!line || line.startsWith('```')) return null;
    const parsed = parseModelLine(line);
    return parsed ? { ok: true, line: parsed } : { ok: false, reason: 'gecersiz_satir' };
  };
  for await (const chunk of chunks) {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const item = handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (item) {
        yield item;
        if (item.ok && item.line.t === 'son') return;
      }
    }
  }
  const item = handle(buffer);
  if (item) yield item;
}
