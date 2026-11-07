/* global document, window, setTimeout */
// Screenshots at 375, 768 and 1440 px and an axe-core scan of each page.
// Usage: start the production server (pnpm --filter @kazuist/web build && start), then
//   NODE_PATH=<dir with playwright and @axe-core/playwright> node docs/tasarim/ekran-goruntusu.mjs http://localhost:3000 docs/tasarim/ekran
// Writes PNG files and axe-sonuc.json into the output folder; exits 1 on any critical or serious violation.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(join(process.env.NODE_PATH ?? process.cwd(), 'x.js'));
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const [base = 'http://localhost:3000', out = 'docs/tasarim/ekran'] = process.argv.slice(2);
const pages = [
  ['ana-sayfa', '/'],
  ['fiyatlar', '/fiyatlar'],
  ['hukuki', '/hukuki'],
  ['hukuki-gizlilik', '/hukuki/gizlilik'],
  ['hukuki-kosullar', '/hukuki/kosullar'],
  ['hukuki-uyari', '/hukuki/uyari'],
  ['hukuki-iade-ve-kredi', '/hukuki/iade-ve-kredi'],
  ['bulunamadi', '/bulunmayan-adres'],
  ['bakim', '/bakim'],
  ['casuist-tr', '/tr'],
  ['casuist-tr-ortak', '/tr/ortak'],
  ['casuist-tr-hakkinda', '/tr/hakkinda'],
  ['eski', '/eski'],
  ['tespit', '/tespit'],
  ['pratik', '/pratik'],
  ['yazma', '/yazma'],
];
const widths = [375, 768, 1440];
mkdirSync(out, { recursive: true });
// PW_CHROME lets a cached browser build be reused when it differs from the installed Playwright.
const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const results = {};
let bad = 0;
for (const [name, path] of pages) {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Lazy images load only near the viewport; load them all before the full page shot.
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
      const bekle = (img) =>
        new Promise((ok) => {
          if (img.complete) return ok();
          img.addEventListener('load', ok, { once: true });
          img.addEventListener('error', ok, { once: true });
          setTimeout(ok, 5000);
        });
      await Promise.all([...document.images].map(bekle));
    });
    await page.screenshot({ path: join(out, `${name}-${w}.png`), fullPage: true });
    const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (w === 1440 || w === 375) {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length }));
      results[`${name}@${w}`] = { violations: v, horizontalOverflowPx: scrollX };
      bad += v.filter((x) => x.impact === 'critical' || x.impact === 'serious').length;
    } else {
      results[`${name}@${w}`] = { horizontalOverflowPx: scrollX };
    }
    if (scrollX > 0) bad++;
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(out, 'axe-sonuc.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 1));
process.exit(bad ? 1 : 0);
