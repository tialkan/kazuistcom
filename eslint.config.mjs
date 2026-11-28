import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.claude/**',
      'docs/denetim/repro/**',
      '**/node_modules/**',
      '**/.next/**',
      'infra/karsilama/site/**',
      '**/dist/**',
      '**/coverage/**',
      'packages/contracts/src/generated/**',
      'packages/db/migrations/**',
      'apps/web/next-env.d.ts',
      'services/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // ADR-0039: server code logs only through @kazuist/log (packages/log), which keeps an error's class name and
    // SQLSTATE fields and drops its message, detail, query and params (Drizzle and Postgres put e-mail addresses
    // there). packages/log/test/lint-rule.test.ts fails if this block stops matching server files.
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/worker-node/src/**/*.ts', 'packages/*/src/**/*.{ts,tsx}'],
    ignores: [
      'packages/log/src/**',
      '**/__tests__/**',
      '**/test/**',
      '**/*.test.{ts,tsx}',
      // Build time generators run by hand from a terminal, not server code.
      'apps/web/src/app/*/_veri/uret.ts',
    ],
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.name=/^(log|logError|logWarn|logEvent|logRequestError|writeLog)$/] MemberExpression[property.name=/^(message|stack|detail|hint|query|params|cause|toString)$/]',
          message:
            'Log fields never carry error text (message, stack, detail, hint, query, params, cause). Pass the error itself to logError or logWarn (ADR-0039).',
        },
        {
          selector:
            'CallExpression[callee.name=/^(log|logError|logWarn|logEvent|logRequestError|writeLog)$/] :matches(CallExpression[callee.name="String"], CallExpression[callee.object.name="JSON"])',
          message:
            'Log fields never carry a stringified error. Pass the error itself to logError or logWarn (ADR-0039).',
        },
      ],
    },
  },
);
