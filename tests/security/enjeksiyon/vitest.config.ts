import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Run from the repository root: pnpm exec vitest run --config tests/security/enjeksiyon/vitest.config.ts */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: { include: ['*.test.ts'] },
});
