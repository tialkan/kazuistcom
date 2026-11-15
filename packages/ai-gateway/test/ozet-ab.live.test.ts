import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAdapters, platformModel, ROUTES, SOURCED_SUMMARY_SYSTEM } from '../src/index.ts';
import { PRE_102_SYSTEM, fixtureCases, formatReport, measure, type Call } from './ozet-ab.ts';

/**
 * Live A/B of the sourced summary instruction on the casuist fixture (50 questions, 2 x 50 calls to the platform
 * summary model through OpenRouter with zdr; 1,3 M prompt characters, about 0,45 M input tokens by estimateTokens).
 * Manual only, never in CI:
 *
 *   pnpm --filter @kazuist/ai-gateway test:ab
 *
 * Needs ~/Desktop/kazuist-openrouter.txt with OPENROUTER_API_KEY=...; the key is never printed. Prompts are masked
 * like production (ozet-ab.ts). Prints counts only; KAZUIST_AB_OUT=<file> also writes them as JSON.
 */
function readKey(file: string, name: string): string | null {
  try {
    const m = new RegExp(`^${name}=(.+)$`, 'm').exec(readFileSync(join(homedir(), 'Desktop', file), 'utf8'));
    return m?.[1]?.trim() || null;
  } catch {
    return null;
  }
}
const live = process.env.KAZUIST_LIVE_AB === '1' && !process.env.CI;
const apiKey = live ? readKey('kazuist-openrouter.txt', 'OPENROUTER_API_KEY') : null;

describe.skipIf(!apiKey)('live A/B: pre-#102 Ek D.1 against SOURCED_SUMMARY_SYSTEM (OpenRouter, zdr)', () => {
  it('abstention on the fixture does not get worse', async () => {
    const adapter = createAdapters().openrouter;
    const route = ROUTES.ozet;
    const call: Call = async function* (system, prompt) {
      for await (const c of adapter.stream(
        {
          provider: 'openrouter',
          model: platformModel('openrouter', route.model),
          system,
          prompt,
          maxOutputTokens: route.maxOutputTokens,
        },
        { apiKey: apiKey ?? '', openRouter: { zdr: true }, timeoutMs: route.timeoutMs },
      ))
        if (c.type === 'text') yield c.text;
    };
    const reports = await measure(
      await fixtureCases(),
      { onceki: PRE_102_SYSTEM, yeni: SOURCED_SUMMARY_SYSTEM },
      call,
    );
    console.log(formatReport(reports));
    if (process.env.KAZUIST_AB_OUT)
      writeFileSync(process.env.KAZUIST_AB_OUT, `${JSON.stringify(reports, null, 2)}\n`);
    const { onceki, yeni } = reports;
    expect(onceki?.errors).toBe(0);
    expect(yeni?.errors).toBe(0);
    expect(yeni?.groups.cevapli.abstained).toBeLessThanOrEqual(onceki?.groups.cevapli.abstained ?? 0);
    expect(yeni?.groups.cevapsiz.abstained).toBeGreaterThanOrEqual(onceki?.groups.cevapsiz.abstained ?? 0);
  }, 600_000);
});
