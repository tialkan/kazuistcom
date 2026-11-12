import { expect, test } from '@playwright/test';

/**
 * Sign up and sign in (gate "giris calisir", plan 10.1). The API flow runs through the real Better Auth
 * handler and Postgres; the UI flow checks that /kayit and /giris offer the forms a user needs.
 * Each run uses a fresh example.invalid address, so no real person data is created.
 */
const password = `kalite-${Math.random().toString(36).slice(2)}-Parola1`;
const email = () => `kalite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;

/**
 * Better Auth and withAuth accept cookie writes only from our own origin (plan 5.6/3). A distinct
 * documentation-range client IP keeps repeated local runs out of one per-IP auth bucket; behind Traefik
 * the proxy overwrites the header.
 */
const origin = (baseURL: string | undefined) => ({
  origin: new URL(baseURL ?? 'http://localhost:3300').origin,
  'x-real-ip': `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
});

test.describe('account API flow', () => {
  test('sign up, read /v1/me, sign out, sign in again; session cookie attributes', async ({
    page,
    baseURL,
    context,
  }) => {
    const headers = origin(baseURL);
    const address = email();

    const up = await page.request.post('/api/auth/sign-up/email', {
      headers,
      data: { email: address, password, name: 'Kalite Deneme' },
    });
    expect(up.status(), await up.text()).toBe(200);

    const me = await page.request.get('/api/v1/me');
    expect(me.status()).toBe(200);
    expect((await me.json()).email).toBe(address);

    const cookies = await context.cookies();
    const session = cookies.find((c) => /session_token$/.test(c.name));
    expect(session, `session cookie among ${cookies.map((c) => c.name).join(', ')}`).toBeTruthy();
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    test.info().annotations.push({
      type: 'cookies',
      description: cookies
        .map((c) => `${c.name} httpOnly=${c.httpOnly} secure=${c.secure} sameSite=${c.sameSite}`)
        .join('; '),
    });

    const out = await page.request.post('/api/auth/sign-out', { headers, data: {} });
    expect(out.status()).toBe(200);
    expect((await page.request.get('/api/v1/me')).status()).toBe(401);

    const wrong = await page.request.post('/api/auth/sign-in/email', {
      headers,
      data: { email: address, password: [...password].reverse().join('') },
    });
    expect(wrong.status()).toBe(401);

    const inAgain = await page.request.post('/api/auth/sign-in/email', {
      headers,
      data: { email: address, password },
    });
    expect(inAgain.status()).toBe(200);
    expect((await (await page.request.get('/api/v1/me')).json()).email).toBe(address);
  });

  test('a short password is refused (minPasswordLength 10)', async ({ page, baseURL }) => {
    const r = await page.request.post('/api/auth/sign-up/email', {
      headers: origin(baseURL),
      data: { email: email(), password: 'kisa1', name: 'Kalite' },
    });
    expect(r.status()).toBe(400);
  });
});

test.describe('account UI flow', () => {
  test('/kayit offers an e-mail and password form that creates the account', async ({ page }) => {
    await page.goto('/kayit');
    const address = email();
    await page.getByLabel(/e-posta/i).fill(address);
    await page
      .getByLabel(/parola/i)
      .first()
      .fill(password);
    // Registration requires the terms and privacy notice consent box (P7).
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /kayıt|hesap oluştur|devam/i }).click();
    await expect.poll(async () => (await page.request.get('/api/v1/me')).status()).toBe(200);
  });

  test('/giris offers an e-mail and password form', async ({ page }) => {
    await page.goto('/giris');
    await expect(page.getByLabel(/e-posta/i)).toBeVisible();
    await expect(page.getByLabel(/parola/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /giriş/i })).toBeVisible();
  });
});
