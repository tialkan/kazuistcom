import { expect, test } from '@playwright/test';
import { base } from './yardim.ts';

/**
 * plan 5.6/1 and Ek I WebSECRobot: CSP with a nonce, default-src 'self', object-src 'none',
 * frame-ancestors 'none', base-uri 'self', no unsafe-eval, no third party script; HSTS, nosniff,
 * Referrer-Policy, Permissions-Policy; X-Powered-By off. Checked on pages and on API responses.
 */
const PAGES = ['/', '/fiyatlar', '/hukuki/aydinlatma', '/problem', '/giris'];
const API = ['/api/health', '/api/version', '/api/v1/prices'];
const https = process.env.KAZUIST_SEC_EXPECT_HTTPS === '1';

function directives(csp: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) m.set(name.toLowerCase(), values);
  }
  return m;
}

test.describe('Content-Security-Policy (plan 5.6/1)', () => {
  for (const path of PAGES) {
    test(`${path} sends a nonce based CSP`, async ({ request }) => {
      const res = await request.get(path);
      const csp = res.headers()['content-security-policy'] ?? '';
      expect(csp, `${path} Content-Security-Policy header`).not.toBe('');
      const d = directives(csp);
      expect(d.get('default-src')).toEqual(["'self'"]);
      expect(d.get('object-src')).toEqual(["'none'"]);
      expect(d.get('frame-ancestors')).toEqual(["'none'"]);
      expect(d.get('base-uri')).toEqual(["'self'"]);
      const script = d.get('script-src') ?? d.get('default-src') ?? [];
      expect(script.some((v) => v.startsWith("'nonce-"))).toBe(true);
      expect(csp).not.toContain("'unsafe-eval'");
      expect(script).not.toContain("'unsafe-inline'");
      // The nonce in the header must be the one on the page scripts.
      const nonce = script.find((v) => v.startsWith("'nonce-"))?.slice(7, -1) ?? '';
      const html = await res.text();
      const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
      for (const s of scripts) expect(s, 'every script carries the nonce').toContain(`nonce="${nonce}"`);
    });
  }

  test('no third party script on the main pages', async ({ request, baseURL }) => {
    for (const path of PAGES) {
      const html = await (await request.get(path)).text();
      const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1] ?? '');
      const foreign = srcs.filter((s) => /^https?:\/\//.test(s) && new URL(s).origin !== base(baseURL));
      expect(foreign, path).toEqual([]);
    }
  });
});

test.describe('other security headers (plan 5.6/1)', () => {
  for (const path of [...PAGES, ...API]) {
    test(`${path}`, async ({ request }) => {
      const h = (await request.get(path)).headers();
      expect(h['x-powered-by'], 'X-Powered-By must be off').toBeUndefined();
      expect(h['x-content-type-options']).toBe('nosniff');
      expect(h['referrer-policy'] ?? '').toMatch(
        /^(strict-origin-when-cross-origin|no-referrer|same-origin)$/,
      );
      expect(h['permissions-policy'] ?? '', 'Permissions-Policy').not.toBe('');
      if (https) expect(h['strict-transport-security'] ?? '').toMatch(/max-age=\d{7,}/);
      else expect(h['strict-transport-security'], 'HSTS is configured (sent on HTTPS)').toBeDefined();
    });
  }
});

test.describe('session cookie attributes (plan 5.6/2)', () => {
  test('HttpOnly, SameSite=Lax and Secure', async ({ request, baseURL }) => {
    const res = await request.post('/api/auth/sign-up/email', {
      headers: { origin: base(baseURL), 'x-real-ip': '198.51.100.251' },
      data: {
        email: `cerez-${Date.now()}@example.invalid`,
        password: `cerez-${Math.random().toString(36).slice(2)}-P1`,
        name: 'Cerez Deneme',
      },
    });
    expect(res.status()).toBe(200);
    const cookies = res.headersArray().filter((x) => x.name.toLowerCase() === 'set-cookie');
    const session = cookies.find((c) => /session_token=/.test(c.value));
    expect(session, 'session cookie').toBeTruthy();
    const v = session?.value ?? '';
    expect(v).toMatch(/;\s*HttpOnly/i);
    expect(v).toMatch(/;\s*SameSite=Lax/i);
    expect(v).toMatch(/;\s*Secure/i);
    expect(v).toMatch(/;\s*Path=\//i);
  });
});
