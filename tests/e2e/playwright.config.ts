import { defineConfig, devices } from '@playwright/test';

/**
 * Wave gate smoke tests (plan 15.1, 15.3/9, 15.3/13). They run against an already running server:
 *   KAZUIST_E2E_BASE_URL   default http://localhost:3300 (local production build, docs/kalite/README.md)
 *   KAZUIST_E2E_BASIC_AUTH user:password for staging behind HTTP Basic Auth (plan 5.4); read from the
 *                          environment only, never written to a file or a report.
 * Not wired into CI yet: docs/istekler/kalite-ci-e2e.md.
 */
const baseURL = process.env.KAZUIST_E2E_BASE_URL ?? 'http://localhost:3300';
const basic = process.env.KAZUIST_E2E_BASIC_AUTH;
const [username, password] = basic
  ? [basic.slice(0, basic.indexOf(':')), basic.slice(basic.indexOf(':') + 1)]
  : [];

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/sonuc.json' }]],
  use: {
    baseURL,
    locale: 'tr-TR',
    ...(username !== undefined && password !== undefined
      ? { httpCredentials: { username, password, send: 'always' as const } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
