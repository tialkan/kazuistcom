import { describe, expect, it } from 'vitest';
import { passagesFromPrompt } from '../../casuist/src/answer/passages.ts';
import { SOURCED_SUMMARY_SYSTEM } from '../src/prompt.ts';
import { PRE_102_SYSTEM, fixtureCases, measure, type Call } from './ozet-ab.ts';

/**
 * Plumbing of the A/B harness with scripted models, so the live run (ozet-ab.live.test.ts) is known to count what
 * it claims. The scripted models ignore the instruction; these are not model measurements.
 */
const line = (id: string, metin: string, alinti: string): string =>
  `${JSON.stringify({ t: 'cumle', metin, kaynaklar: [id], alinti: { [id]: alinti } })}\n`;

/** Quotes the first words of the first passage body (at least 24 characters), then tries its künye line. */
const obeying: Call = async function* (_system, prompt) {
  const [p] = passagesFromPrompt(prompt);
  if (!p) return;
  const words = (p.body ?? '').split(/\s+/);
  let n = 8;
  while (n < words.length && words.slice(0, n).join(' ').length < 24) n++;
  const quote = words.slice(0, n).join(' ');
  const head = p.text.split('\n')[0] ?? '';
  yield line(p.id, quote, quote);
  yield line(p.id, head, head);
  yield '{"t":"son"}\n';
};

/** Quotes 15 characters, as the pre-#102 "kısa bir dayanak alıntısı" allowed. */
const shortQuotes: Call = async function* (_system, prompt) {
  const [p] = passagesFromPrompt(prompt);
  if (!p) return;
  const quote = (p.body ?? '').slice(0, 15);
  yield '```json\n';
  yield line(p.id, quote, quote);
  yield '```\n{"t":"son"}\n';
};

describe('A/B harness on the fixture set', () => {
  it('builds 50 masked prompts in the product format and counts outcomes per group', async () => {
    const cases = await fixtureCases();
    expect(cases).toHaveLength(50);
    const n = (g: string) => cases.filter((c) => c.group === g).length;
    expect([n('cevapli'), n('cevapsiz'), n('tuzak')]).toEqual([36, 11, 3]);
    const withPrompt = cases.filter((c) => c.prompt !== null);
    expect(cases.filter((c) => c.group === 'cevapli' && c.prompt === null)).toHaveLength(0);
    for (const c of withPrompt) {
      expect(c.prompt).toMatch(/^<soru>\n[\s\S]*\n<\/soru>\n<kaynaklar>\n/);
      expect(passagesFromPrompt(c.prompt ?? '').length).toBeGreaterThan(0);
    }

    const r = await measure(cases, { yeni: SOURCED_SUMMARY_SYSTEM, onceki: PRE_102_SYSTEM }, obeying);
    for (const v of [r.yeni, r.onceki]) {
      expect(v?.errors).toBe(0);
      expect(v?.groups.cevapli).toEqual({ n: 36, abstained: 0 });
      expect(v?.sentences).toBe(36);
      // The künye line is never a valid quote.
      expect(v?.reasons).toEqual({ alinti_bulunamadi: withPrompt.length });
    }

    const s = await measure(cases, { kisa: PRE_102_SYSTEM }, shortQuotes);
    expect(s.kisa?.groups.cevapli).toEqual({ n: 36, abstained: 36 });
    expect(s.kisa?.reasons).toEqual({ alinti_kisa: withPrompt.length });
  }, 30_000);

  it('a failing call is counted as an error and left out of the rates', async () => {
    const cases = (await fixtureCases(2)).filter((c) => c.prompt !== null);
    const failing: Call = async function* () {
      yield '';
      throw new Error('provider down');
    };
    const r = await measure(cases, { yeni: SOURCED_SUMMARY_SYSTEM }, failing);
    expect(r.yeni?.errors).toBe(cases.length);
    expect(r.yeni?.groups.cevapli.n).toBe(0);
  });
});
