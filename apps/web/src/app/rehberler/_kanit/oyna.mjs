/* global document, window, localStorage */
// Browser evidence for /rehberler: every page at 375, 768 and 1440 px is scanned with axe-core, checked for
// horizontal overflow and screenshotted; progress marks are set with the keyboard and must survive a reload and stay
// apart per list; the ethics details open with the keyboard and are scanned open.
// Usage (production server running):
//   NODE_PATH=<dir with playwright> AXE_PATH=<path of axe.min.js> PW_CHROME=<chrome executable> \
//   node apps/web/src/app/rehberler/_kanit/oyna.mjs http://localhost:3141 apps/web/src/app/rehberler/_kanit/ekran
// Writes PNG files and dogrulama.json into the output folder; exits 1 on any failed check or axe violation.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(join(process.env.NODE_PATH ?? process.cwd(), 'x.js'));
const { chromium } = require('playwright');
const axeKaynagi = readFileSync(process.env.AXE_PATH ?? 'axe.min.js', 'utf8');

const [base = 'http://localhost:3141', out = 'ekran'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const sonuc = { kontroller: [], axe: {} };
let hata = 0;
const kontrol = (ad, tamam, ayrinti = '') => {
  sonuc.kontroller.push({ ad, tamam: Boolean(tamam), ayrinti });
  if (!tamam) {
    hata++;
    console.error(`FAIL ${ad} ${ayrinti}`);
  }
};

async function axeTara(page, ad, w) {
  // bypassCSP is a setting of this test browser only (the local server's CSP has no unsafe-eval).
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ content: axeKaynagi });
  const r = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    }),
  );
  const ihlal = r.violations.map((v) => ({ id: v.id, etki: v.impact, dugum: v.nodes.length }));
  sonuc.axe[`${ad}-${w}`] = { ihlal, gecen: r.passes.length };
  if (ihlal.length) {
    hata++;
    console.error(`AXE ${ad}-${w}`, JSON.stringify(ihlal));
  }
}

const tasma = async (page, ad, w) => {
  const fark = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  kontrol(`yatay taşma yok: ${ad} ${w}`, fark <= 0, `fark ${fark}`);
};
const ekran = (page, ad, w) => page.screenshot({ path: join(out, `${ad}-${w}.png`), fullPage: true });
const metin = (page, secici) => page.locator(secici).first().innerText();

async function tabIle(page, secici, en = 120) {
  for (let i = 0; i < en; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, secici)) return true;
    await page.keyboard.press('Tab');
  }
  return page.evaluate((s) => document.activeElement?.matches(s) ?? false, secici);
}

const sayfalar = [
  ['anasayfa', '/rehberler'],
  ['makale', '/rehberler/makale'],
  ['tez', '/rehberler/tez'],
  ['zotero-endnote', '/rehberler/zotero-endnote'],
  ['kontrol-listesi', '/rehberler/kontrol-listesi'],
  ['etik', '/rehberler/etik'],
];

for (const w of [375, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, bypassCSP: true });
  const page = await ctx.newPage();
  for (const [ad, yol] of sayfalar) {
    await page.goto(base + yol, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    kontrol(`tek h1: ${ad} ${w}`, (await page.locator('h1').count()) === 1);
    await tasma(page, ad, w);
    await axeTara(page, ad, w);
    await ekran(page, ad, w);
  }

  // Etik kutusu: opens with the keyboard, scanned open.
  await page.goto(base + '/rehberler/makale', { waitUntil: 'load' });
  kontrol(`etik özeti Tab ile odaklanır ${w}`, await tabIle(page, 'details > summary'));
  await page.keyboard.press('Enter');
  kontrol(
    `etik kutusu Enter ile açılır ${w}`,
    await page
      .locator('details')
      .first()
      .evaluate((d) => d.open),
  );
  kontrol(`altı ihlal görünür ${w}`, (await page.locator('details[open] ol > li').count()) === 6);
  await tasma(page, 'makale-etik-acik', w);
  await axeTara(page, 'makale-etik-acik', w);
  await ekran(page, 'makale-etik-acik', w);

  // Article progress with the keyboard, survives reload, thesis and checklist stay empty.
  await page.goto(base + '/rehberler/makale', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  kontrol(`makale: ilk onay kutusuna Tab ile ulaşılır ${w}`, await tabIle(page, 'input[type=checkbox]'));
  await page.keyboard.press('Space');
  kontrol(
    `makale: Boşluk ile işaretlenir ${w}`,
    (await metin(page, 'p[aria-live]')).includes('1 / 12 adım tamamlandı'),
  );
  kontrol(
    `makale: adım işareti metindir (kaydet durumu satırı yok) ${w}`,
    !(await page.locator('[role=status]').count()),
  );
  await page.reload({ waitUntil: 'load' });
  kontrol(
    `makale: işaret yenilemeden sonra kalır ${w}`,
    (await metin(page, 'p[aria-live]')).includes('1 / 12 adım tamamlandı'),
  );
  await ekran(page, 'makale-ilerleme', w);
  await page.goto(base + '/rehberler/tez', { waitUntil: 'load' });
  kontrol(
    `tez ilerlemesi ayrı: 0 / 12 ${w}`,
    (await metin(page, 'p[aria-live]')).includes('0 / 12 adım tamamlandı'),
  );
  await page.goto(base + '/rehberler', { waitUntil: 'load' });
  kontrol(
    `ana sayfa makale ilerlemesini gösterir ${w}`,
    (await page.locator('main, body').first().innerText()).includes('1 / 12 adım tamamlandı, 8%'),
  );

  // Checklist with the keyboard.
  await page.goto(base + '/rehberler/kontrol-listesi', { waitUntil: 'load' });
  kontrol(`kontrol: onay kutusuna Tab ile ulaşılır ${w}`, await tabIle(page, 'input[type=checkbox]'));
  await page.keyboard.press('Space');
  kontrol(
    `kontrol: işaretlenir ${w}`,
    (await metin(page, 'p[aria-live]')).includes('1 / 14 madde işaretlendi'),
  );
  await page.reload({ waitUntil: 'load' });
  kontrol(
    `kontrol: işaret yenilemeden sonra kalır ${w}`,
    (await metin(page, 'p[aria-live]')).includes('1 / 14 madde işaretlendi'),
  );
  await axeTara(page, 'kontrol-isaretli', w);
  await ekran(page, 'kontrol-isaretli', w);

  // Closed modules are not linked.
  for (const [ad, yol] of sayfalar) {
    await page.goto(base + yol, { waitUntil: 'load' });
    kontrol(
      `kapalı modüle bağlantı yok: ${ad} ${w}`,
      (await page
        .locator('main a[href="/ara"], main a[href="/yazma"], a[href="/ara"]:not(nav a)')
        .count()) === 0,
    );
  }
  await ctx.close();
}

await browser.close();
writeFileSync(join(out, 'dogrulama.json'), JSON.stringify(sonuc, null, 2) + '\n');
console.log(
  `${sonuc.kontroller.length} kontrol, ${Object.keys(sonuc.axe).length} axe taraması, ${hata} sorun`,
);
process.exit(hata ? 1 : 0);
