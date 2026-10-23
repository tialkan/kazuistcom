import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAdapters, type ProviderAdapter } from '../src/index.ts';

/**
 * Real provider smoke tests. Run only with KAZUIST_LIVE_SMOKE=1, never in CI, and each only when
 * its key file exists on the Desktop. The key value is never printed.
 * - ~/Desktop/kazuist-openrouter.txt: OPENROUTER_API_KEY=... (platform primary, ADR-0025)
 * - ~/Desktop/kazuist-anthropic.txt: ANTHROPIC_API_KEY=... (fallback)
 */
function readKey(file: string, name: string): string | null {
  try {
    const m = new RegExp(`^${name}=(.+)$`, 'm').exec(readFileSync(join(homedir(), 'Desktop', file), 'utf8'));
    return m?.[1]?.trim() || null;
  } catch {
    return null;
  }
}
const live = process.env.KAZUIST_LIVE_SMOKE === '1' && !process.env.CI;
const openRouterKey = live ? readKey('kazuist-openrouter.txt', 'OPENROUTER_API_KEY') : null;
const anthropicKey = live ? readKey('kazuist-anthropic.txt', 'ANTHROPIC_API_KEY') : null;

async function shortReply(adapter: ProviderAdapter, model: string, apiKey: string): Promise<string> {
  let text = '';
  for await (const c of adapter.stream(
    {
      provider: adapter.provider,
      model,
      system: 'Yalnızca {"t":"son"} yaz.',
      prompt: 'Başla.',
      maxOutputTokens: 16,
    },
    { apiKey, openRouter: { zdr: true } },
  ))
    if (c.type === 'text') text += c.text;
  return text;
}

describe.skipIf(!openRouterKey)('live smoke (OpenRouter, Haiku 5.5, zdr)', () => {
  it('streams a short fixed reply', async () => {
    const text = await shortReply(
      createAdapters().openrouter,
      'anthropic/claude-haiku-5.5',
      openRouterKey ?? '',
    );
    expect(text).toContain('son');
  }, 30_000);
});

describe.skipIf(!anthropicKey)('live smoke (Anthropic, Haiku 5.5)', () => {
  it('streams a short fixed reply', async () => {
    const text = await shortReply(createAdapters().anthropic, 'claude-haiku-5-5', anthropicKey ?? '');
    expect(text).toContain('son');
  }, 30_000);
});
