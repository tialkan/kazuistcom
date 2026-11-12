/* global document, window */
// Shell screenshots for guest and signed in states at 375, 768 and 1440 px, with an axe scan of each page.
// Usage: start the production server with a database (docs/kalite/README.md), then
//   NODE_PATH=<absolute path of tests/e2e/node_modules> node docs/tasarim/kabuk-oturum-ekran.mjs <base> docs/tasarim/ekran
// Signs up two throwaway accounts (example.invalid, RFC 5737 IP) on that local database only.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(join(process.env.NODE_PATH ?? process.cwd(), 'x.js'));
const { chromium } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');

const [base = 'http://localhost:3307', out = '.'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const widths = [375, 768, 1440];
const browser = await chromium.launch();
const results = {};
let bad = 0;

async function hesapAc(ctx, ad, meslek) {
  const email = `kabuk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  // One code request per IP and window (rules.codeIp): each sign up gets its own documentation range IP.
  const ip = `192.0.2.${10 + Math.floor(Math.random() * 200)}`;
  const h = { origin: base, 'content-type': 'application/json', 'x-real-ip': ip };
  const r = await ctx.request.post(`${base}/api/auth/sign-up/email`, {
    headers: h,
    data: { email, password: `Pw-${Math.random().toString(36).slice(2)}-Aa9!x`, name: ad },
  });
  if (!r.ok()) throw new Error(`sign-up ${r.status()}`);
  if (meslek) {
    const p = await ctx.request.put(`${base}/api/v1/me/target-profession`, {
      headers: h,
      data: { professionId: meslek, avatar: `${meslek}-n` },
    });
    if (!p.ok()) throw new Error(`target ${p.status()}`);
  }
}

const durumlar = [
  ['misafir', null, ['/', '/bulunmayan-adres', '/giris']],
  ['oturum', { ad: 'İrem Kaya', meslek: 'avukat' }, ['/', '/hesap', '/pratik']],
  ['oturum-hedefsiz', { ad: 'çağla', meslek: null }, ['/']],
];

for (const [ad, kim, yollar] of durumlar) {
  const ctx = await browser.newContext();
  if (kim) await hesapAc(ctx, kim.ad, kim.meslek);
  for (const yol of yollar) {
    for (const w of widths) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(base + yol, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const ad2 = `kabuk-${ad}${yol === '/' ? '' : yol.replace(/\//g, '-')}-${w}`;
      if (yol === '/') await page.screenshot({ path: join(out, `${ad2}.png`) });
      const hedefim = await page.locator('.kabuk-hedefim').evaluate((el) => ({
        href: el.getAttribute('href'),
        metin: el.textContent,
      }));
      const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length }));
      results[`${ad}:${yol}@${w}`] = { hedefim, violations: v, horizontalOverflowPx: scrollX };
      bad += v.filter((x) => x.impact === 'critical' || x.impact === 'serious').length + (scrollX > 0 ? 1 : 0);
      await page.close();
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(out, 'kabuk-oturum-axe.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 1));
process.exit(bad ? 1 : 0);
