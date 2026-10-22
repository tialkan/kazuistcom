import { expect, test } from '@playwright/test';

/**
 * plan 14.9: /.env and /.git/ are not reachable; neither are build files, lock files or source maps.
 * Error bodies carry no stack trace or internals (contract Error body).
 */
const HIDDEN = [
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.env.example',
  '/.git/',
  '/.git/config',
  '/.git/HEAD',
  '/.git/index',
  '/.gitignore',
  '/.github/workflows/ci.yml',
  '/package.json',
  '/pnpm-lock.yaml',
  '/next.config.ts',
  '/server.js',
  '/.next/BUILD_ID',
  '/.next/server/app/page.js',
  '/apps/web/.env',
  '/%2e%2e/%2e%2e/.env',
  '/_next/static/../../.env',
  '/_next/static/..%2f..%2f.env',
  '/docs/kaynak/Kazuist.docx',
  '/infra/docker-compose.dev.yml',
];

test.describe('sensitive paths are not served', () => {
  for (const path of HIDDEN) {
    test(path, async ({ request }) => {
      // A trailing slash redirect (308) is allowed as long as the target is not served either.
      const res = await request.get(path, { maxRedirects: 2 });
      expect([400, 401, 403, 404, 405], `${path} -> ${res.status()}`).toContain(res.status());
      const body = await res.text();
      expect(body).not.toMatch(
        /DATABASE_URL|BETTER_AUTH_SECRET|\[core\]|repositoryformatversion|"dependencies"/,
      );
    });
  }

  test('production source maps are not public', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const chunks = [...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]).slice(0, 5);
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      const res = await request.get(`${c}.map`);
      expect(res.status(), `${c}.map`).toBe(404);
    }
  });
});

test.describe('errors leak nothing', () => {
  test('malformed JSON and unknown API paths answer without internals', async ({ request }) => {
    const cases = [
      await request.post('/api/v1/kvkk-requests/guest', {
        headers: { 'content-type': 'application/json' },
        data: '{"a":',
      }),
      await request.post('/api/v1/takedown-requests', {
        headers: { 'content-type': 'application/json' },
        data: '[[[',
      }),
      await request.get('/api/v1/yok-boyle-bir-uc'),
      await request.post('/api/v1/webhooks/iyzico', { data: 'x'.repeat(70_000) }),
    ];
    for (const res of cases) {
      const body = await res.text();
      expect(res.status(), body.slice(0, 200)).toBeLessThan(500);
      expect(body).not.toMatch(/at .+\(.+:\d+:\d+\)|node_modules|\/app\/|\/Users\/|stack/i);
    }
  });

  test('HEAD is answered, not 405 (plan 13.2/8)', async ({ request }) => {
    for (const path of ['/', '/fiyatlar', '/api/health']) {
      const res = await request.head(path);
      expect(res.status(), path).toBe(200);
    }
  });
});
