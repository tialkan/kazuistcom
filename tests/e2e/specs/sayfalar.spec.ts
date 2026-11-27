import { expect, test, type Page } from '@playwright/test';
import { CASUIST, HUKUKI_TR, KALDIRILAN_EN } from '../adresler.ts';

/**
 * Script errors and failed same-origin requests collected while a page loads. Next.js Link prefetches
 * (RSC requests for the navigation targets) are left out here: broken navigation targets are reported by
 * the link test below, so a page test only fails for the page itself.
 */
function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    const u = new URL(r.url());
    const prefetch = u.searchParams.has('_rsc') || r.request().headers()['rsc'] !== undefined;
    if (!prefetch && u.origin === new URL(page.url() || r.url()).origin && r.status() >= 400)
      errors.push(`${r.status()} ${u.pathname}`);
  });
  return errors;
}

async function open(page: Page, path: string) {
  const errors = watch(page);
  const res = await page.goto(path, { waitUntil: 'load' });
  expect(res?.status(), `${path} status`).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();
  expect(await page.title(), `${path} has a title`).not.toBe('');
  return errors;
}

/** Every <img> on the page has loaded with a real size (Casuist images, plan Ek H "birebir"). */
async function imagesLoaded(page: Page) {
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    for (const i of imgs) i.loading = 'eager';
    await Promise.all(
      imgs.map((i) => (i.complete ? null : new Promise((r) => i.addEventListener('load', r)))),
    );
  });
  return page.evaluate(() =>
    Array.from(document.images)
      .filter((i) => i.naturalWidth === 0)
      .map((i) => i.currentSrc || i.src),
  );
}

test.describe('product shell', () => {
  test('home: welcome scene with one h1 and one call to action to /lansman', async ({ page }) => {
    const errors = await open(page, '/');
    await expect(page.locator('h1')).toHaveCount(1);
    const cta = page.locator('.kzw-cta');
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveAttribute('href', '/lansman');
    await expect(page.locator('.kzw-harf')).toHaveCount(7);
    // ADR-0032: Turkish only, no English link or language switch.
    await expect(page.locator('a[href="/en"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('/lansman counts down to 12 December', async ({ page }) => {
    const errors = await open(page, '/lansman');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('[role="timer"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('/fiyatlar shows the plan and package tables', async ({ page }) => {
    const errors = await open(page, '/fiyatlar');
    expect(await page.locator('table').count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(/kredi/i).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('skip link moves focus to the main content', async ({ page }) => {
    await open(page, '/fiyatlar');
    await page.keyboard.press('Tab');
    const skip = page.locator(':focus');
    await expect(skip).toHaveAttribute('href', '#icerik');
    await page.keyboard.press('Enter');
    await expect(page.locator('#icerik')).toBeFocused();
  });

  test('each page has exactly one main landmark', async ({ page }) => {
    for (const path of ['/', '/fiyatlar', '/hukuki', '/giris', '/kayit', '/hesap', '/tr']) {
      await page.goto(path);
      expect(await page.locator('main').count(), `${path} main count`).toBe(1);
    }
  });
});

test.describe('legal texts (/hukuki)', () => {
  test('/hukuki lists every public Turkish text', async ({ page }) => {
    await open(page, '/hukuki');
    // Contract templates are shown in the payment step with the order values, not in the index.
    const templates = new Set(['abonelik', 'acik-riza', 'mesafeli-satis', 'on-bilgilendirme']);
    for (const slug of HUKUKI_TR.filter((x) => !templates.has(x)))
      await expect(page.locator(`a[href="/hukuki/${slug}"]`).first()).toBeVisible();
  });

  for (const slug of HUKUKI_TR) {
    test(`/hukuki/${slug} renders, carries a version and is not indexed while draft`, async ({ page }) => {
      const errors = await open(page, `/hukuki/${slug}`);
      await expect(page.getByText(/Sürüm|Version/).first()).toBeVisible();
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots ?? '').toContain('noindex');
      // Unfilled {{PLACEHOLDER}} values may only appear under the draft band (test environments).
      const html = await page.content();
      if (/\{\{[A-Z_]+\}\}/.test(html)) await expect(page.locator('.hukuki-taslak').first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test.describe('protected Casuist pages', () => {
  for (const path of CASUIST) {
    test(`${path} renders with its images`, async ({ page }) => {
      const errors = await open(page, path);
      expect(await imagesLoaded(page), `${path} broken images`).toEqual([]);
      await expect(page.locator('html'), `${path} content language`).toHaveAttribute('lang', 'tr');
      expect(await page.locator('[lang="en"], [hreflang]').count(), `${path} English markup`).toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test('no page links to a removed English address (ADR-0032)', async ({ page }) => {
    for (const path of ['/', ...CASUIST]) {
      await page.goto(path);
      for (const gone of KALDIRILAN_EN)
        expect(await page.locator(`a[href="${gone}"]`).count(), `${path} links to ${gone}`).toBe(0);
    }
  });
});

test.describe('internal links (WebLINKrobot, local)', () => {
  test('every same-origin link on the main pages answers 200 or a single redirect to 200', async ({
    page,
    request,
  }) => {
    const seen = new Set<string>();
    for (const path of ['/', '/fiyatlar', '/hukuki', '/tr', '/tr/sorun', '/hukuki/gizlilik', '/eski']) {
      await page.goto(path);
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).href));
      for (const h of hrefs) {
        const u = new URL(h);
        if (u.origin !== new URL(page.url()).origin) continue;
        seen.add(u.pathname);
      }
    }
    const broken: string[] = [];
    for (const p of [...seen].sort()) {
      const r = await request.get(p, { maxRedirects: 1 });
      if (r.status() !== 200) broken.push(`${r.status()} ${p}`);
    }
    test.info().annotations.push({ type: 'checked-links', description: String(seen.size) });
    expect(broken, 'broken internal links').toEqual([]);
  });
});
