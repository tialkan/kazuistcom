/** One Server Sent Events frame. */
export interface SseFrame {
  event: string;
  data: string;
}

/**
 * Minimal SSE reader for fetch response bodies (EventSource cannot POST). Handles frames split across chunks,
 * CRLF line ends, multi line data and comment lines.
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const parse = (block: string): SseFrame | null => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue;
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    return data.length ? { event, data: data.join('\n') } : null;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let at: number;
      while ((at = buf.search(/\r?\n\r?\n/)) >= 0) {
        const block = buf.slice(0, at);
        buf = buf.slice(at).replace(/^\r?\n\r?\n/, '');
        const frame = parse(block);
        if (frame) yield frame;
      }
    }
    buf += dec.decode();
    const last = parse(buf);
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}
