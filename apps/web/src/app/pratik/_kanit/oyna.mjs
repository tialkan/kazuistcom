/* global document, window, localStorage */
// Browser evidence for /pratik: the four games, the spaced repetition session and the exam are played with the
// keyboard only at 375, 768 and 1440 px; every state is scanned with axe-core and screenshotted.
// Usage (production server started with PRATIK_ONIZLEME=1, because no card is approved by two editors yet):
//   NODE_PATH=<dir with playwright and @axe-core/playwright> node apps/web/src/app/pratik/_kanit/oyna.mjs http://localhost:3126 apps/web/src/app/pratik/_kanit/ekran
// Writes PNG files and dogrulama.json into the output folder; exits 1 on any failed check or axe violation.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(join(process.env.NODE_PATH ?? process.cwd(), 'x.js'));
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const [base = 'http://localhost:3126', out = 'ekran'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const sonuc = { genislikler: {}, kontroller: [], axe: {} };
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

async function ekran(page, ad, w) {
  await page.screenshot({ path: join(out, `${ad}-${w}.png`), fullPage: true });
}

/** Presses Tab until the focused element matches, at most `en` times. Keyboard only navigation. */
async function tabIle(page, secici, en = 80) {
  for (let i = 0; i < en; i++) {
    const uygun = await page.evaluate((s) => document.activeElement?.matches(s) ?? false, secici);
    if (uygun) return true;
    await page.keyboard.press('Tab');
  }
  return page.evaluate((s) => document.activeElement?.matches(s) ?? false, secici);
}

const odakMetni = (page) =>
  page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 80) ?? '');

async function oyunOyna(page, w, desteSlug, oyunAdi, ad) {
  await page.goto(`${base}/pratik/deste/${desteSlug}`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  // Keyboard: tab to the mode button of this game and press Enter.
  const bulundu = await tabIle(page, 'button[class*="modDugme"]');
  kontrol(`${ad}: mod düğmesine Tab ile ulaşılır ${w}`, bulundu);
  let n = 0;
  while (
    n++ < 12 &&
    !(await page.evaluate((a) => document.activeElement?.textContent?.includes(a), oyunAdi))
  ) {
    await page.keyboard.press('Tab');
  }
  kontrol(
    `${ad}: oyun düğmesi odakta ${w}`,
    (await odakMetni(page)).includes(oyunAdi),
    await odakMetni(page),
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=Başla');
  await page.keyboard.press('Tab');
  kontrol(
    `${ad}: Başla düğmesi odakta ${w}`,
    (await odakMetni(page)).startsWith('Başla'),
    await odakMetni(page),
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-oyun]');
  await ekran(page, `${ad}-soru`, w);
  await axeTara(page, `${ad}-soru`, w);
  await tasma(page, `${ad}-soru`, w);

  let kartNo = 0;
  let yanlisSayisi = 0;
  const secimler = ['1', '2', '1', '2', '1', '2', '1', '2', '1', '2'];
  for (;;) {
    const odakSoru = await page.evaluate(() => document.activeElement?.className?.includes('soru') ?? false);
    kontrol(`${ad}: kart ${kartNo + 1} odak soru metninde ${w}`, odakSoru);
    const adet = await page.locator('[data-oyun] button').count();
    const tus = secimler[kartNo] <= String(adet) ? secimler[kartNo] : '1';
    await page.keyboard.press(tus);
    await page.waitForSelector('[data-sonuc]');
    const sonucAttr = await page.getAttribute('[data-sonuc]', 'data-sonuc');
    if (sonucAttr === 'yanlis') yanlisSayisi++;
    const metin = await page.locator('[data-sonuc] h3').innerText();
    kontrol(
      `${ad}: kart ${kartNo + 1} sonuç metinle söylenir ${w}`,
      /Doğru yanıt|Yanlış yanıt/.test(metin),
      metin,
    );
    const isaretler = await page.locator('[data-durum="dogru"]').count();
    kontrol(`${ad}: kart ${kartNo + 1} doğru seçenek işaretli ${w}`, isaretler === 1);
    const odakGeri = await page.evaluate(() => document.activeElement?.hasAttribute('data-sonuc') ?? false);
    kontrol(`${ad}: kart ${kartNo + 1} odak sonuç bloğuna gelir ${w}`, odakGeri);
    const ic = await page.locator('[data-sonuc]').innerText();
    kontrol(
      `${ad}: kart ${kartNo + 1} açıklama ve alıntı ve kaynak var ${w}`,
      /Açıklama/.test(ic) && /Kaynak/.test(ic) && /Kanun metni|alıntı|kanun/i.test(ic),
    );
    if (kartNo === 0) {
      await ekran(page, `${ad}-sonuc`, w);
      await axeTara(page, `${ad}-sonuc`, w);
      await tasma(page, `${ad}-sonuc`, w);
    }
    // Keyboard to the Continue button.
    const devam = await tabIle(page, 'button.kz-dugme--birincil');
    kontrol(`${ad}: Devam düğmesine Tab ile ulaşılır ${w}`, devam);
    await page.keyboard.press('Enter');
    kartNo++;
    const bitti = await page.locator('text=Tur bitti').count();
    if (bitti) break;
    await page.waitForSelector('[data-oyun]');
    if (kartNo > 12) break;
  }
  await page.waitForSelector('text=Tur bitti');
  await ekran(page, `${ad}-tur-sonu`, w);
  await axeTara(page, `${ad}-tur-sonu`, w);
  await tasma(page, `${ad}-tur-sonu`, w);
  const ozet = await page.locator('main, body').first().innerText();
  kontrol(`${ad}: puan ve ilerleme gösterilir ${w}`, /Puan \d+ \/ \d+/.test(ozet));
  if (yanlisSayisi > 0) {
    kontrol(`${ad}: yanlışlar listesi ve tekrar düğmesi ${w}`, /Yanlışları tekrar et/.test(ozet));
    await page.getByRole('button', { name: 'Yanlışları tekrar et' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-oyun]');
    const tur2 = await page.innerText('body');
    kontrol(`${ad}: ikinci tur başlar ${w}`, /2\. tur/.test(tur2));
  }
}

for (const w of [375, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  const sayfalar = [
    ['merkez', '/pratik'],
    ['deste', '/pratik/deste/anayasa-hukuku'],
    ['hmgs', '/pratik/hmgs'],
    ['deneme-hazir', '/pratik/hmgs/deneme'],
    ['editor-yetkisiz', '/pratik/editor'],
    ['bugun', '/pratik/bugun'],
  ];
  for (const [ad, yol] of sayfalar) {
    const yanit = await page.goto(base + yol, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    kontrol(`HTTP 200: ${yol} ${w}`, yanit?.status() === 200, String(yanit?.status()));
    await ekran(page, ad, w);
    await axeTara(page, ad, w);
    await tasma(page, ad, w);
  }

  // The four games, keyboard only.
  await oyunOyna(page, w, 'anayasa-hukuku', 'Olay kartı', 'olay');
  await oyunOyna(page, w, 'anayasa-hukuku', 'Hâlâ geçerli mi?', 'hala');
  await oyunOyna(page, w, 'anayasa-hukuku', 'Doğru mu yanlış mı?', 'dogruyanlis');
  await oyunOyna(page, w, 'anayasa-hukuku', 'Hangisi önce?', 'hangisi');

  // Spaced repetition session on the deck.
  await page.goto(`${base}/pratik/deste/medeni-hukuk`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page
    .getByRole('button', { name: /Aralıklı tekrar/ })
    .first()
    .focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=Bugünkü tekrarı başlat');
  await ekran(page, 'calisma-hazir', w);
  await axeTara(page, 'calisma-hazir', w);
  await page.getByRole('button', { name: 'Bugünkü tekrarı başlat' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-oyun]');
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('text=Bugünlük bitti').count()) > 0) break;
    await page.keyboard.press('1');
    await page.waitForSelector('[data-sonuc]');
    if (i === 0) {
      await ekran(page, 'calisma-sonuc', w);
      await axeTara(page, 'calisma-sonuc', w);
    }
    const dogru = (await page.getAttribute('[data-sonuc]', 'data-sonuc')) === 'dogru';
    if (dogru) {
      await tabIle(page, 'button[class*="kz-dugme"]');
      const etiket = await odakMetni(page);
      kontrol(
        `çalışma: derece düğmeleri sıradaki tekrarı gösterir ${w}`,
        /Zor|İyi|Kolay/.test(etiket) && /gün|yarın/.test(etiket),
        etiket,
      );
      await page.getByRole('button', { name: /^İyi/ }).focus();
    } else {
      await page.getByRole('button', { name: 'Devam' }).focus();
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
  }
  const depo = JSON.parse((await page.evaluate(() => localStorage.getItem('kazuist.pratik.v1'))) ?? '{}');
  const kartSayisi = Object.keys(depo.kartlar ?? {}).length;
  kontrol(`çalışma: günlük yeni kart sınırı 10 ${w}`, kartSayisi === 10, `kayıtlı ${kartSayisi}`);
  kontrol(`çalışma: seri 1 gün ${w}`, depo.seri?.gun === 1);
  await page.waitForSelector('text=Bugünlük bitti');
  await ekran(page, 'calisma-bitti', w);
  await axeTara(page, 'calisma-bitti', w);
  await page.reload({ waitUntil: 'load' });
  await page
    .getByRole('button', { name: /Aralıklı tekrar/ })
    .first()
    .click();
  await page.waitForSelector('text=Bugün alınabilecek yeni kart');
  const bekleyen = await page.locator('main, body').first().innerText();
  kontrol(
    `çalışma: yarın tekrar kartları bugün yeniden gelmez, yeni kart sınırı dolu ${w}`,
    /0\s+Bugün alınabilecek yeni kart/.test(bekleyen) ||
      /Bugün için tekrar ya da yeni kart yok|Bugün çalışılacak kart yok/.test(bekleyen),
    bekleyen.slice(0, 200),
  );

  // Partial HMGS exam: start, answer with the keyboard, navigate, finish.
  await page.goto(`${base}/pratik/hmgs/deneme`, { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.removeItem('kazuist.pratik.v1');
    localStorage.removeItem('kazuist.pratik.deneme.v1');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('text=Denemeye başlamadan');
  const hazir = await page.innerText('body');
  kontrol(`deneme: kısmi deneme açıkça söylenir ${w}`, /Kısmi deneme/.test(hazir) && /dakika/.test(hazir));
  await page.getByRole('button', { name: 'Başla' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="timer"]');
  await ekran(page, 'deneme-sinav', w);
  await axeTara(page, 'deneme-sinav', w);
  await tasma(page, 'deneme-sinav', w);
  const sayac = await page.locator('[role="timer"]').innerText();
  kontrol(`deneme: geri sayım gösterilir ${w}`, /sa .* dk .* sn/.test(sayac), sayac);
  await page.keyboard.press('3');
  const secili = await page.locator('[data-durum="secili"]').count();
  kontrol(
    `deneme: seçim metinle gösterilir, sonuç gösterilmez ${w}`,
    secili === 1 && (await page.locator('[data-durum="dogru"]').count()) === 0,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[role="timer"]');
  kontrol(
    `deneme: yenilemeden sonra yanıt korunur ${w}`,
    (await page.locator('[data-durum="secili"]').count()) === 1,
  );
  await page.getByRole('button', { name: 'Sonraki soru' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('2');
  await page.getByRole('button', { name: 'Sonra bak' }).focus();
  await page.keyboard.press('Enter');
  kontrol(
    `deneme: işaret düğmesi basılı durumu bildirir ${w}`,
    (await page.getByRole('button', { name: 'İşareti kaldır' }).getAttribute('aria-pressed')) === 'true',
  );
  await page.getByRole('button', { name: 'Denemeyi bitir' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="alertdialog"]');
  await axeTara(page, 'deneme-onay', w);
  kontrol(
    `deneme: onay penceresinde odak vazgeç düğmesinde ${w}`,
    (await odakMetni(page)).startsWith('Hayır'),
    await odakMetni(page),
  );
  await page.getByRole('button', { name: 'Evet, bitir' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=Deneme sonucu');
  await ekran(page, 'deneme-sonuc', w);
  await axeTara(page, 'deneme-sonuc', w);
  await tasma(page, 'deneme-sonuc', w);
  const sonucMetni = await page.innerText('body');
  kontrol(
    `deneme: puan, baraj sonucu ve konu raporu ${w}`,
    /Puan: [\d,]+ \/ 100/.test(sonucMetni) &&
      /Baraj altı|Baraj üstü/.test(sonucMetni) &&
      /Konu raporu/.test(sonucMetni),
  );
  const d2 = JSON.parse((await page.evaluate(() => localStorage.getItem('kazuist.pratik.v1'))) ?? '{}');
  kontrol(
    `deneme: sonuç geçmişe yazıldı, yanlış ve boşlar tekrar destesinde ${w}`,
    d2.denemeler?.length === 1 && Object.keys(d2.kartlar ?? {}).length > 0,
  );
  kontrol(`deneme: yeni kart sınırı kullanılmadı ${w}`, d2.gunluk?.yeni === 0);
  await page.goto(`${base}/pratik/hmgs`, { waitUntil: 'load' });
  await page.waitForSelector('text=Son denemeler');
  await ekran(page, 'hmgs-rapor', w);
  await axeTara(page, 'hmgs-rapor', w);
  await tasma(page, 'hmgs-rapor', w);
  await ctx.close();
}

await browser.close();
sonuc.hataSayisi = hata;
writeFileSync(join(out, 'dogrulama.json'), `${JSON.stringify(sonuc, null, 2)}\n`);
console.log(
  `${sonuc.kontroller.length} checks, ${Object.keys(sonuc.axe).length} axe scans, ${hata} problem(s).`,
);
process.exit(hata ? 1 : 0);
