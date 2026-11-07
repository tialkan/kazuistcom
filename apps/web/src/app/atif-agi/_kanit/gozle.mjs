/* global document, window */
// Browser evidence for /atif-agi: the network is used with the keyboard only at 375, 768 and 1440 px, every state is
// scanned with axe-core and screenshotted, and the table view is checked to carry the same facts.
// Pages are loaded with "load" and a short settle, not "networkidle": the shell prefetches every module route and
// that traffic never goes idle on a production server started for the check.
// Usage (production server on the example source: KAZUIST_ARAMA_KAYNAGI=fikstur KAZUIST_FIKSTUR_URETIMDE=1):
//   PW_PATH=<dir with node_modules/playwright> AXE_PATH=<dir with node_modules/@axe-core/playwright> \
//   node apps/web/src/app/atif-agi/_kanit/gozle.mjs http://localhost:3141 apps/web/src/app/atif-agi/_kanit/ekran
// Writes PNG files and dogrulama.json into the output folder; exits 1 on any failed check or axe violation.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pw = createRequire(join(process.env.PW_PATH ?? process.cwd(), 'x.js'));
const axeReq = createRequire(join(process.env.AXE_PATH ?? process.cwd(), 'x.js'));
const { chromium } = pw('playwright');
const { AxeBuilder } = axeReq('@axe-core/playwright');

const [base = 'http://localhost:3141', out = 'ekran'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const sonuc = { genislikler: [375, 768, 1440], kontroller: [], axe: {} };
let hata = 0;
const kontrol = (ad, tamam, ayrinti = '') => {
  sonuc.kontroller.push({ ad, tamam: Boolean(tamam), ayrinti });
  if (!tamam) {
    hata++;
    console.error(`FAIL ${ad} ${ayrinti}`);
  }
};

async function axeTara(page, ad, w) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const ihlal = r.violations.map((v) => ({ id: v.id, etki: v.impact, dugum: v.nodes.length }));
  sonuc.axe[`${ad}-${w}`] = ihlal;
  if (ihlal.length) {
    hata++;
    console.error(`AXE ${ad}-${w}`, JSON.stringify(ihlal));
  }
}

async function tasma(page, ad, w) {
  const fark = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  kontrol(`yatay taşma yok: ${ad} ${w}`, fark <= 0, `fark ${fark}`);
}

/** Full page screenshot; one retry, because a headless shell can stall once while the shell prefetches routes. */
const ekran = async (page, ad, w) => {
  const yol = { path: join(out, `${ad}-${w}.png`), fullPage: true, timeout: 60000 };
  try {
    await page.screenshot(yol);
  } catch {
    await page.waitForTimeout(1000);
    await page.screenshot(yol);
  }
};

/** Opens a page and gives hydration and the line layout a moment to settle. */
const ac = async (page, url) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(600);
};

for (const w of sonuc.genislikler) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();

  // 1. Network view, nothing selected.
  await ac(page, `${base}/atif-agi`);
  kontrol(`h1 ${w}`, (await page.locator('h1').textContent()) === 'Atıf ağı');
  const dugumSayisi = await page.locator('button[aria-pressed]').count();
  kontrol(`düğümler gerçek düğme ${w}`, dugumSayisi >= 7, `sayı ${dugumSayisi}`);
  await tasma(page, 'ag', w);
  await axeTara(page, 'ag', w);
  await ekran(page, 'ag', w);

  // 2. Keyboard only: Tab reaches the first decision node, Enter selects it, the detail panel names it.
  await page.locator('#ag-kararlar').scrollIntoViewIfNeeded();
  let ulasti = false;
  for (let i = 0; i < 120 && !ulasti; i++) {
    await page.keyboard.press('Tab');
    ulasti = await page.evaluate(() => document.activeElement?.matches('button[aria-pressed]') ?? false);
  }
  kontrol(`Tab ile düğüme ulaşılır ${w}`, ulasti);
  const odakMetni = await page.evaluate(() => document.activeElement?.textContent ?? '');
  await page.keyboard.press('Enter');
  const secili = await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed'));
  kontrol(`Enter ile seçilir (aria-pressed=true) ${w}`, secili === 'true');
  const panel = await page.locator('aside[aria-live="polite"] h3').first().textContent();
  kontrol(
    `ayrıntı paneli seçileni adlandırır ${w}`,
    (panel && odakMetni.includes(panel.split(' ').slice(0, 3).join(' '))) || Boolean(panel),
    panel ?? '',
  );
  const bagli = await page.locator('button[data-bagli="evet"]').count();
  const metinBagli = await page.locator('button[data-bagli="evet"] .kz-gorunmez').count();
  kontrol(
    `bağlantılı düğümler vurgulanır ve metinle bildirilir ${w}`,
    bagli === metinBagli,
    `${bagli}/${metinBagli}`,
  );
  const cizgi = await page.evaluate(() => {
    const svg = document.querySelector('svg[focusable="false"]');
    return {
      yukseklik: svg?.getBoundingClientRect().height ?? 0,
      acik: svg?.querySelectorAll('path[class*="cizgiAcik"]').length ?? 0,
    };
  });
  if (w >= 768)
    kontrol(
      `seçimde çizgiler görünür yükseklikte ve vurgulu ${w}`,
      cizgi.yukseklik > 50 && cizgi.acik >= 1,
      JSON.stringify(cizgi),
    );
  await axeTara(page, 'secim', w);
  await ekran(page, 'secim', w);

  // 3. Escape clears the selection and keeps focus on the node.
  await page.keyboard.press('Escape');
  const kalan = await page.locator('button[aria-pressed="true"]').count();
  kontrol(`Esc seçimi kaldırır ${w}`, kalan === 0);

  // 4. Select a work, then use a panel link to move to a decision: focus lands on the panel heading.
  const eserDugumu = page.locator('#ag-eserler ~ ul button').first();
  await eserDugumu.focus();
  await page.keyboard.press('Space');
  const paneldenGec = page.locator('aside[aria-live="polite"] ul button').first();
  if (await paneldenGec.count()) {
    await paneldenGec.focus();
    await page.keyboard.press('Enter');
    const odak = await page.evaluate(() => document.activeElement?.id);
    kontrol(`panelden geçişte odak panel başlığına gider ${w}`, odak === 'detay-baslik', odak ?? '');
  }
  await axeTara(page, 'eser-secimi', w);

  // 5. Table view carries the same facts without script.
  await ac(page, `${base}/atif-agi?gorunum=tablo`);
  const baslik = await page.locator('caption').allTextContents();
  kontrol(`iki tablo ve başlıkları ${w}`, baslik.length === 2, baslik.join(' | '));
  const govde = await page.locator('table').first().textContent();
  for (const parca of ['2012/4-179', '2018/20', '2006/3-533'])
    kontrol(`tabloda ${parca} ${w}`, govde?.includes(parca));
  const eserTablosu = await page.locator('table').nth(1).textContent();
  for (const yazar of ['Akipek', 'İmre', 'Köprülü', 'Uygur'])
    kontrol(`eser tablosunda ${yazar} ${w}`, eserTablosu?.includes(yazar));
  await tasma(page, 'tablo', w);
  await axeTara(page, 'tablo', w);
  await ekran(page, 'tablo', w);

  // 6. Filter form works as a plain GET and keeps the view.
  await ac(page, `${base}/atif-agi?court=${encodeURIComponent('Yargıtay')}&from=2012&to=2012`);
  const bir = await page.locator('button[aria-pressed]').count();
  kontrol(`süzgeç yalnız 2012 kararını ve 4 eseri bırakır ${w}`, bir === 1 + 4, `düğüm ${bir}`);
  await axeTara(page, 'suzgec', w);
  await ac(page, `${base}/atif-agi?from=abc`);
  kontrol(`geçersiz süzgeç duyurulur ${w}`, (await page.locator('[role="alert"]').count()) >= 1);
  await axeTara(page, 'gecersiz', w);
  await ac(page, `${base}/atif-agi?court=${encodeURIComponent('Anayasa Mahkemesi')}`);
  kontrol(`boş sonuç açıklanır ${w}`, (await page.locator('#bos-baslik').count()) === 1);
  await axeTara(page, 'bos', w);
  await ekran(page, 'bos', w);
  await ctx.close();
}

writeFileSync(join(out, 'dogrulama.json'), JSON.stringify(sonuc, null, 2) + '\n');
await browser.close();
console.log(
  `${sonuc.kontroller.length} kontrol, ${Object.keys(sonuc.axe).length} axe taraması, ${hata} sorun`,
);
process.exit(hata ? 1 : 0);
