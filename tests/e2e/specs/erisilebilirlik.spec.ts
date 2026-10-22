import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ANA_SAYFALAR } from '../adresler.ts';

/**
 * axe on the main pages at the three gate widths (CLAUDE.md "375, 768, 1440 px"; plan 15.3/9).
 * Gate rule: no critical or serious violation. Moderate and minor ones are attached to the result and
 * listed in docs/kalite/dalga-<n>.md. Horizontal overflow is checked at every width.
 */
const WIDTHS = [375, 768, 1440] as const;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

for (const width of WIDTHS) {
  test.describe(`axe at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const path of ANA_SAYFALAR) {
      test(`${path}`, async ({ page }, info) => {
        const res = await page.goto(path, { waitUntil: 'load' });
        expect(res?.status()).toBe(200);
        const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const rows = result.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          target: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
        }));
        await info.attach('axe.json', {
          body: JSON.stringify(rows, null, 2),
          contentType: 'application/json',
        });
        for (const r of rows)
          info.annotations.push({ type: `axe-${r.impact}`, description: `${r.id} x${r.nodes}` });

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
        const blocking = rows.filter((r) => r.impact === 'critical' || r.impact === 'serious');
        expect(blocking, `${path} critical or serious axe violations`).toEqual([]);
      });
    }
  });
}
