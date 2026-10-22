import { expect, test } from '@playwright/test';
import { EK_H } from '../adresler.ts';

/**
 * plan Ek H and 15.3/13: every protected address answers 200, or one 301 that lands on a 200.
 * Redirects are not followed automatically so the hop count and the status code are both checked.
 */
test.describe('Ek H: 23 protected addresses', () => {
  test('the table has 23 rows', () => {
    expect(EK_H).toHaveLength(23);
  });

  for (const row of EK_H) {
    test(`#${row.no} ${row.path}`, async ({ request }) => {
      const first = await request.get(row.path, { maxRedirects: 0 });
      if (!row.to) {
        expect(first.status(), `${row.path} must be 200 without a redirect`).toBe(200);
        return;
      }
      expect(first.status(), `${row.path} must be a single 301`).toBe(301);
      const location = first.headers()['location'] ?? '';
      expect(new URL(location, first.url()).pathname).toBe(row.to);
      const second = await request.get(new URL(location, first.url()).toString(), { maxRedirects: 0 });
      expect(second.status(), `${row.to} must answer 200 directly (one hop only)`).toBe(200);
    });
  }

  test('/en is the Casuist English home (200)', async ({ request }) => {
    expect((await request.get('/en', { maxRedirects: 0 })).status()).toBe(200);
  });
});
