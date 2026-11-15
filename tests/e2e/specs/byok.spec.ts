import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request, type TestInfo } from '@playwright/test';

/**
 * BYOK (FR-84, plan 8.1-8.4, K-08) and the payments-off launch mode (K-09). openrouter.ai is mocked inside the
 * browser with page.route, so no request leaves for a real provider and no real key exists anywhere: KEY below is
 * made up. The main assertion of every flow: the key goes to openrouter.ai only, never to Kazuist.
 */
const KEY = 'sk-or-v1-e2e-0000000000000000000000000000000000000000';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const WIDTHS = [375, 768, 1440] as const;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

const password = `kalite-${Math.random().toString(36).slice(2)}-Parola1`;
const email = () => `byok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;

/** Every request to Kazuist's own origin, headers and body, to prove the key never reaches it. */
function watchKazuist(page: Page, origin: string): string[] {
  const seen: string[] = [];
  page.on('request', (r: Request) => {
    if (new URL(r.url()).origin === origin) seen.push(JSON.stringify(r.headers()) + (r.postData() ?? ''));
  });
  return seen;
}

async function axe(page: Page, info: TestInfo, name: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const rows = result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  await info.attach(`axe-${name}.json`, {
    body: JSON.stringify(rows, null, 2),
    contentType: 'application/json',
  });
  expect(
    rows.filter((r) => r.impact === 'critical' || r.impact === 'serious'),
    `${name}: critical or serious axe violations`,
  ).toEqual([]);
}

async function signUp(page: Page, baseURL: string | undefined): Promise<void> {
  const r = await page.request.post('/api/auth/sign-up/email', {
    headers: {
      origin: new URL(baseURL ?? 'http://localhost:3300').origin,
      'x-real-ip': `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
    },
    data: { email: email(), password, name: 'Kalite Deneme' },
  });
  expect(r.status(), await r.text()).toBe(200);
}

async function saveKey(page: Page, opts: { remember?: boolean } = {}): Promise<void> {
  await page.goto('/hesap/yz-anahtari');
  await expect(page.getByTestId('byok-durum')).toContainText('Kayıtlı anahtar yok');
  await page.getByLabel('OpenRouter API anahtarı').fill(KEY);
  if (opts.remember) await page.getByLabel('Bu cihazda hatırla').check();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'kaydedildi' })).toBeVisible();
}

/** A model line quoting five plain words of the first passage it was sent, so the validator accepts it. */
function modelReply(prompt: string): string {
  const m = /<kaynak id="(K\d+)"[^>]*>\n([\s\S]*?)\n<\/kaynak>/.exec(prompt);
  if (!m) return '{"t":"yetersiz","neden":"kaynak yok"}\n{"t":"son"}\n';
  const words = (m[2] ?? '').split(/\s+/);
  let quote = '';
  for (let i = 0; i + 5 <= words.length; i++) {
    const run = words.slice(i, i + 5);
    if (run.every((w) => w && !/[\d[\]‹›"\\]/.test(w))) {
      quote = run.join(' ');
      if (quote.length >= 20) break;
    }
  }
  const line = {
    t: 'cumle',
    metin: 'Kaynak bu konuda bir düzenleme içeriyor.',
    kaynaklar: [m[1]],
    alinti: { [m[1] as string]: quote },
  };
  return `${JSON.stringify(line)}\n{"t":"son"}\n`;
}

interface ProviderCall {
  authorization: string | undefined;
  body: { model: string; provider: unknown; messages: { content: string }[] };
}

/** Mocks POST https://openrouter.ai/api/v1/chat/completions with an SSE stream built from the prompt. */
async function mockOpenRouter(page: Page): Promise<ProviderCall[]> {
  const calls: ProviderCall[] = [];
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = req.postDataJSON() as ProviderCall['body'];
    calls.push({ authorization: req.headers().authorization, body });
    const text = modelReply(body.messages[1]?.content ?? '');
    const frames = text
      .split('\n')
      .filter(Boolean)
      .map((l) => `data: ${JSON.stringify({ choices: [{ delta: { content: `${l}\n` } }] })}\n\n`)
      .join('');
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'text/event-stream' },
      body: `${frames}data: [DONE]\n\n`,
    });
  });
  return calls;
}

test.describe('BYOK settings page (/hesap/yz-anahtari)', () => {
  test('stores the key in sessionStorage by default, in localStorage only on opt in, and removes it', async ({
    page,
    baseURL,
  }) => {
    const kazuist = watchKazuist(page, new URL(baseURL ?? 'http://localhost:3300').origin);
    await saveKey(page);
    const stored = () =>
      page.evaluate(() => ({
        session: sessionStorage.getItem('kazuist.byok.v1'),
        local: localStorage.getItem('kazuist.byok.v1'),
      }));
    let s = await stored();
    expect(s.session).toContain('openrouter');
    expect(s.local).toBeNull();
    await expect(page.getByTestId('byok-durum')).toContainText('sk-or-');
    await expect(page.getByTestId('byok-durum')).not.toContainText(KEY);
    // The stored key is never put back into the form.
    await expect(page.getByLabel('OpenRouter API anahtarı')).toHaveValue('');

    await page.getByLabel('Bu cihazda hatırla').check();
    await expect(page.getByRole('note').filter({ hasText: 'yerel deposunda' })).toBeVisible();
    await page.getByRole('button', { name: 'Kaydet' }).click();
    s = await stored();
    expect(s.session).toBeNull();
    expect(s.local).toContain('openrouter');

    await page.getByRole('button', { name: 'Anahtarı sil' }).click();
    s = await stored();
    expect(s).toEqual({ session: null, local: null });
    await expect(page.getByTestId('byok-durum')).toContainText('Kayıtlı anahtar yok');
    for (const r of kazuist) expect(r).not.toContain(KEY);
  });

  test('"Anahtarı dene" asks OpenRouter directly and warns about the free tier and a missing limit', async ({
    page,
  }) => {
    const auth: (string | undefined)[] = [];
    await page.route('https://openrouter.ai/api/v1/key', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      auth.push(route.request().headers().authorization);
      await route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ data: { is_free_tier: true, limit: null } }),
      });
    });
    await page.goto('/hesap/yz-anahtari');
    await page.getByLabel('OpenRouter API anahtarı').fill(KEY);
    await page.getByRole('button', { name: 'Anahtarı dene' }).click();
    await expect(page.getByText('OpenRouter anahtarı kabul etti.')).toBeVisible();
    await expect(page.getByText(/ücretsiz katmanında/)).toBeVisible();
    await expect(page.getByText(/harcama sınırı yok/)).toBeVisible();
    expect(auth).toEqual([`Bearer ${KEY}`]);
  });

  test('a free model shows the free tier warning; invalid input is refused with messages', async ({
    page,
  }) => {
    await page.goto('/hesap/yz-anahtari');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('API anahtarını yazın.')).toBeVisible();
    await page.getByLabel('Başka bir model kimliği').check();
    await page.getByRole('textbox', { name: 'Model kimliği' }).fill('inclusionai/ling-3.2-flash:free');
    await expect(page.getByRole('heading', { name: 'Ücretsiz model uyarısı' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Model kimliği' }).fill('bicimsiz');
    await page.getByLabel('OpenRouter API anahtarı').fill(KEY);
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Model kimliğini yazar/model-adi biçiminde yazın.')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('kazuist.byok.v1'))).toBeNull();
  });

  for (const width of WIDTHS) {
    test(`axe and screenshot at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/hesap/yz-anahtari');
      await page.getByLabel('Bu cihazda hatırla').check();
      await page.getByLabel('Başka bir model kimliği').check();
      await page.getByRole('textbox', { name: 'Model kimliği' }).fill('inclusionai/ling-3.2-flash:free');
      await axe(page, info, `yz-anahtari-${width}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: info.outputPath(`yz-anahtari-${width}.png`), fullPage: true });
    });
  }
});

test.describe('sourced summary with the user key (/ara)', () => {
  test('real prepare and verify, OpenRouter mocked: the key goes only to openrouter.ai', async ({
    page,
    baseURL,
  }, info) => {
    const origin = new URL(baseURL ?? 'http://localhost:3300').origin;
    await signUp(page, baseURL);
    await saveKey(page);
    const calls = await mockOpenRouter(page);
    const kazuist = watchKazuist(page, origin);
    const paths: string[] = [];
    page.on('request', (r) => paths.push(new URL(r.url()).pathname));
    await page.goto(`/ara?q=${encodeURIComponent('KVKK m.11 ilgili kişinin hakları')}`);
    await expect(page.getByTestId('ozet-byok')).toContainText('Kendi anahtarınızla');
    const prepared = page.waitForResponse((r) => r.url().endsWith('/api/v1/answers/prepare'));
    await page.getByRole('button', { name: 'Kaynaklı özet çıkar' }).click();
    const bundle = (await (await prepared).json()) as { sources: unknown[] };
    if (bundle.sources.length) {
      // Corpus with passages (local run on the fixture corpus): the provider path runs end to end.
      await expect(page.getByText('Kaynak bu konuda bir düzenleme içeriyor.')).toBeVisible();
      await expect(page.getByText('Bu özet kendi anahtarınızla çıkarıldı; kredi düşülmedi.')).toBeVisible();
      expect(calls).toHaveLength(1);
      expect(calls[0]?.authorization).toBe(`Bearer ${KEY}`);
      expect(calls[0]?.body.provider).toEqual({ data_collection: 'deny' });
      await expect.poll(() => paths.filter((p) => p === '/api/v1/answers/verify').length).toBe(1);
    } else {
      // Empty corpus (CI database): the summary abstains and the provider is never called.
      await expect(
        page.getByText('Bu soruya kaynaklarla desteklenebilen bir özet çıkarılamadı.'),
      ).toBeVisible();
      expect(calls).toHaveLength(0);
    }
    for (const r of kazuist) expect(r).not.toContain(KEY);
    await axe(page, info, 'ara-byok');
  });

  test('prepare and verify mocked too: always exercises the provider path and the server verdict', async ({
    page,
    baseURL,
  }, info) => {
    const origin = new URL(baseURL ?? 'http://localhost:3300').origin;
    await signUp(page, baseURL);
    await saveKey(page);
    const calls = await mockOpenRouter(page);
    const passage = 'İlgili kişi, kişisel verilerinin işlenip işlenmediğini öğrenme hakkına sahiptir.';
    await page.route('**/api/v1/answers/prepare', async (route) => {
      expect(route.request().postData() ?? '').not.toContain(KEY);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          nonce: 'e2e-nonce-0000000000000000',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          signature: 'e2e',
          system: 'Kazuist kaynak bağlama motoru (e2e).',
          prompt: `<soru>\nKVKK m.11\n</soru>\n<kaynaklar>\n<kaynak id="K1" tur="mevzuat" otorite="baglayici_norm" durum="yururlukte" tarih="2016-04-07" veri_gunu="${new Date().toISOString().slice(0, 10)}">\n${passage}\n</kaynak>\n</kaynaklar>`,
          sources: [
            {
              id: 'K1',
              recordId: '00000000-0000-4000-8000-000000000011',
              title: '6698 sayılı Kişisel Verilerin Korunması Kanunu m.11',
              authorityClass: 'baglayici_norm',
              status: 'yururlukte',
            },
          ],
          passages: { K1: passage },
          limits: { maxInputTokens: 12000, maxOutputTokens: 400 },
        }),
      });
    });
    const verified: string[] = [];
    await page.route('**/api/v1/answers/verify', async (route) => {
      verified.push(route.request().postData() ?? '');
      const lines = (route.request().postDataJSON() as { lines: string[] }).lines;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: lines.map((_, index) => ({ index, ok: true })), abstained: false }),
      });
    });
    const kazuist = watchKazuist(page, origin);
    await page.goto(`/ara?q=${encodeURIComponent('KVKK m.11')}`);
    await page.getByRole('button', { name: 'Kaynaklı özet çıkar' }).click();
    await expect(page.getByText('Kaynak bu konuda bir düzenleme içeriyor.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dayanağı göster' })).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0]?.body.model).toBe('anthropic/claude-haiku-5.5');
    expect(calls[0]?.body.messages[1]?.content).toContain(passage);
    await expect.poll(() => verified.length).toBe(1);
    expect(verified[0]).not.toContain(KEY);
    for (const r of kazuist) expect(r).not.toContain(KEY);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: info.outputPath(`ara-byok-${width}.png`), fullPage: true });
    }
    await axe(page, info, 'ara-byok-mocked');
  });
});

test.describe('payments-off launch mode (K-09)', () => {
  test('/fiyatlar offers BYOK, and /odeme agrees with /fiyatlar about whether sales are open', async ({
    page,
  }, info) => {
    await page.goto('/fiyatlar');
    await expect(page.getByRole('link', { name: 'Anahtarınızı ekleyin' })).toHaveAttribute(
      'href',
      '/hesap/yz-anahtari',
    );
    const closed = (await page.getByTestId('satis-kapali').count()) > 0;
    info.annotations.push({ type: 'satis', description: closed ? 'kapali' : 'acik' });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: info.outputPath(`fiyatlar-${width}.png`), fullPage: true });
    }
    await axe(page, info, 'fiyatlar');
    await page.goto('/odeme?urun=kredi.300');
    if (closed) {
      await expect(page.getByTestId('satis-kapali')).toBeVisible();
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Kendi anahtarınızı ekleyin' })).toBeVisible();
      await page.screenshot({ path: info.outputPath('odeme-kapali.png'), fullPage: true });
      await axe(page, info, 'odeme-kapali');
    } else {
      await expect(page.getByTestId('satis-kapali')).toHaveCount(0);
    }
  });
});
