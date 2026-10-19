/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { describe, expect, it } from 'vitest';
import { ProviderError, createAdapters, type StreamChunk } from '../src/index.ts';
import { sseBody } from './helpers.ts';

const req = {
  provider: 'anthropic' as const,
  model: 'm',
  system: 'SYS',
  prompt: 'PROMPT',
  maxOutputTokens: 50,
};

function capture(events: string[], status = 200) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    return status === 200 ? sseBody(events) : new Response('{"error":"PROMPT echoed"}', { status });
  };
  return { calls, fetch };
}

async function run(it: AsyncIterable<StreamChunk>) {
  let text = '';
  let usage: StreamChunk | undefined;
  for await (const c of it)
    if (c.type === 'text') text += c.text;
    else usage = c;
  return { text, usage };
}

describe('provider adapters (fake transport)', () => {
  it('anthropic: messages stream, browser header only in browser mode', async () => {
    const { calls, fetch } = capture([
      JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 12, output_tokens: 1 } } }),
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Mer' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'haba' } }),
      JSON.stringify({ type: 'message_delta', usage: { output_tokens: 7 } }),
      JSON.stringify({ type: 'message_stop' }),
    ]);
    const out = await run(createAdapters({ fetch, browser: true }).anthropic.stream(req, { apiKey: 'k' }));
    expect(out).toEqual({ text: 'Merhaba', usage: { type: 'usage', inputTokens: 12, outputTokens: 7 } });
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]!.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(calls[0]!.body).toMatchObject({ system: 'SYS', max_tokens: 50, stream: true });
  });

  it('openrouter: data_collection deny always, zdr optional', async () => {
    const ev = [
      JSON.stringify({ choices: [{ delta: { content: 'a' } }] }),
      JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 1 } }),
      '[DONE]',
    ];
    const a = capture(ev);
    await run(createAdapters({ fetch: a.fetch }).openrouter.stream(req, { apiKey: 'k' }));
    expect(a.calls[0]!.body.provider).toEqual({ data_collection: 'deny' });
    const b = capture(ev);
    const out = await run(
      createAdapters({ fetch: b.fetch }).openrouter.stream(req, { apiKey: 'k', openRouter: { zdr: true } }),
    );
    expect(b.calls[0]!.body.provider).toEqual({ data_collection: 'deny', zdr: true });
    expect(b.calls[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(out.usage).toEqual({ type: 'usage', inputTokens: 3, outputTokens: 1 });
  });

  it('openai: chat completions stream', async () => {
    const { calls, fetch } = capture([JSON.stringify({ choices: [{ delta: { content: 'x' } }] }), '[DONE]']);
    const out = await run(createAdapters({ fetch }).openai.stream(req, { apiKey: 'k' }));
    expect(out.text).toBe('x');
    expect(calls[0]!.body).toMatchObject({ max_completion_tokens: 50 });
    expect(calls[0]!.body).not.toHaveProperty('tools');
  });

  it('gemini: streamGenerateContent with alt=sse and header key, skips thought parts', async () => {
    const { calls, fetch } = capture([
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'gizli', thought: true }, { text: 'g1' }] } }],
      }),
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'g2' }] } }],
        usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
      }),
    ]);
    const out = await run(
      createAdapters({ fetch }).gemini.stream({ ...req, model: 'gemini-x' }, { apiKey: 'gk' }),
    );
    expect(out.text).toBe('g1g2');
    expect(calls[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:streamGenerateContent?alt=sse',
    );
    expect(calls[0]!.headers['x-goog-api-key']).toBe('gk');
    expect(calls[0]!.url).not.toContain('gk');
  });

  it('error responses become ProviderError without the body', async () => {
    const { fetch } = capture([], 401);
    const err = await run(createAdapters({ fetch }).anthropic.stream(req, { apiKey: 'secret-key' })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProviderError);
    expect(String((err as Error).message)).not.toMatch(/PROMPT|secret-key/);
  });
});
