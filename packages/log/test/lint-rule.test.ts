import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The repository ESLint config (eslint.config.mjs) is what keeps raw errors out of server logs (ADR-0039): no
 * `console` in server code, and no error text passed to a log call. This test lints snippets as if they lived at
 * real server paths, so a glob typo or a dropped block turns CI red instead of silently matching nothing.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: root });
});

async function rules(code: string, path: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${root}${path}` });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

const serverPaths = [
  'apps/web/src/server/ornek.ts',
  'apps/web/src/server/billing/ornek.ts',
  'apps/web/src/app/ara/_sunucu/ornek.ts',
  'apps/web/src/app/api/v1/ornek/route.ts',
  'apps/web/src/app/kaydettiklerim/page.tsx',
  'apps/worker-node/src/ornek.ts',
  'apps/worker-node/src/notify/ornek.ts',
  'packages/ledger/src/ornek.ts',
];

describe('server code logs only through @kazuist/log', () => {
  it.each(serverPaths)('console.error with an error object is refused in %s', async (path) => {
    const code = 'export function f(err: unknown) {\n  console.error(err);\n}\n';
    expect(await rules(code, path)).toContain('no-console');
  });

  it('every console method is refused, not only error', async () => {
    for (const m of ['log', 'info', 'warn', 'debug', 'trace']) {
      expect(await rules(`console.${m}('x');\n`, 'apps/web/src/server/ornek.ts')).toContain('no-console');
    }
  });

  it('error text passed to a log call is refused', async () => {
    const cases = [
      "import { logError } from '@kazuist/log';\nexport const f = (e: Error) => logError('x', e, { m: e.message });\n",
      "import { logEvent } from '@kazuist/log';\nexport const f = (e: Error) => logEvent('error', 'x', { s: e.stack ?? '' });\n",
      "import { logEvent } from '@kazuist/log';\nexport const f = (e: unknown) => logEvent('error', 'x', { s: String(e) });\n",
      "import { logEvent } from '@kazuist/log';\nexport const f = (e: unknown) => logEvent('error', 'x', { s: JSON.stringify(e) });\n",
      "export const f = (log: (m: string, x: object) => void, e: { detail: string }) => log('x', { d: e.detail });\n",
    ];
    for (const code of cases)
      expect(await rules(code, 'apps/worker-node/src/ornek.ts')).toContain('no-restricted-syntax');
  });

  it('the sanctioned calls pass', async () => {
    const code =
      "import { logError, logEvent } from '@kazuist/log';\n" +
      'export function f(err: unknown, rule: string) {\n' +
      "  logError('api', err, { rule });\n" +
      "  logEvent('warn', 'rate-limit', { rule, ip: 'unknown' });\n" +
      '}\n';
    expect(await rules(code, 'apps/web/src/server/ornek.ts')).toEqual([]);
  });

  it('the writer itself, tests and terminal generators may use console', async () => {
    const code = "console.error('x');\n";
    for (const path of [
      'packages/log/src/index.ts',
      'apps/web/src/server/auth/__tests__/ornek.test.ts',
      'apps/worker-node/test/ornek.test.ts',
      'apps/web/src/app/yazma/_veri/uret.ts',
      'packages/db/scripts/seed.ts',
    ])
      expect(await rules(code, path)).not.toContain('no-console');
  });
});
