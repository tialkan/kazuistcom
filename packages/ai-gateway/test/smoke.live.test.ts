import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAdapters } from '../src/index.ts';

/**
 * Real provider smoke test. Runs only with KAZUIST_LIVE_SMOKE=1 and when
 * ~/Desktop/kazuist-anthropic.txt (ANTHROPIC_API_KEY=...) exists. Never runs in CI.
 * The key value is never printed.
 */
const file = join(homedir(), 'Desktop', 'kazuist-anthropic.txt');
function readKey(): string | null {
  try {
    const m = /^ANTHROPIC_API_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'));
    return m?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}
const enabled = process.env.KAZUIST_LIVE_SMOKE === '1' && !process.env.CI;

describe.skipIf(!enabled)('live smoke (Anthropic, Haiku 5.5)', () => {
  it('streams a short fixed reply', async () => {
    const key = readKey();
    expect(key, 'key file missing').toBeTruthy();
    let text = '';
    for await (const c of createAdapters().anthropic.stream(
      {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        system: 'Yalnızca {"t":"son"} yaz.',
        prompt: 'Başla.',
        maxOutputTokens: 16,
      },
      { apiKey: key ?? '' },
    ))
      if (c.type === 'text') text += c.text;
    expect(text).toContain('son');
  }, 30_000);
});
