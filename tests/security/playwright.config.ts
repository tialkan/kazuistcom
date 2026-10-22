import { defineConfig } from '@playwright/test';

/**
 * HTTP security checks against a running server (plan 5.6, 14.9, 15.3/7).
 *   KAZUIST_SEC_BASE_URL       default http://localhost:3300
 *   KAZUIST_SEC_BASIC_AUTH     user:password for staging (environment only, never in a file or report)
 *   KAZUIST_SEC_DATABASE_URL   optional; when set, the IDOR spec seeds another user's subscription and order
 *                              rows directly so cross-user access can be tried. Never point it at production.
 *   KAZUIST_SEC_EXPECT_HTTPS   set to 1 on staging and production: HSTS and Secure cookies become mandatory.
 * Not wired into CI yet: docs/istekler/kalite-ci-e2e.md.
 */
const baseURL = process.env.KAZUIST_SEC_BASE_URL ?? 'http://localhost:3300';
const basic = process.env.KAZUIST_SEC_BASIC_AUTH;
const i = basic ? basic.indexOf(':') : -1;

export default defineConfig({
  testDir: './http',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/sonuc.json' }]],
  use: {
    baseURL,
    ...(basic && i > 0
      ? {
          httpCredentials: {
            username: basic.slice(0, i),
            password: basic.slice(i + 1),
            send: 'always' as const,
          },
        }
      : {}),
  },
});
