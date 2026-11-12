/** Minimal Server-Sent Events reader for provider streams. Yields the `data` payload of each event. */
export async function* readSse(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<{ event: string | null; data: string }> {
  if (!body) return;
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  let event: string | null = null;
  let data: string[] = [];
  const flush = function* () {
    if (data.length) yield { event, data: data.join('\n') };
    event = null;
    data = [];
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line === '') {
          yield* flush();
        } else if (line.startsWith(':')) {
          continue;
        } else {
          const idx = line.indexOf(':');
          const field = idx < 0 ? line : line.slice(0, idx);
          const val = idx < 0 ? '' : line.slice(idx + 1).replace(/^ /, '');
          if (field === 'event') event = val;
          else if (field === 'data') data.push(val);
        }
      }
      if (done) break;
    }
    if (buffer) {
      if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /, ''));
    }
    yield* flush();
  } finally {
    // Close the provider connection when the consumer stops early ([DONE] or abort).
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
