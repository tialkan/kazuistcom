import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/**
 * Schema objects from @kazuist/db only type check against the drizzle-orm instance they were built with.
 * pnpm can resolve a second peer variant (for example with kysely from better-auth); the root
 * pnpm-workspace.yaml pins one version and dedupes peer dependents (ADR-0023). This guard fails when the
 * lockfile holds more than one drizzle-orm snapshot, before apps/web hits incompatible column types.
 */
it('the lockfile has exactly one drizzle-orm snapshot', () => {
  const lock = readFileSync(fileURLToPath(new URL('../../../pnpm-lock.yaml', import.meta.url)), 'utf8');
  const snapshots = lock.slice(lock.indexOf('\nsnapshots:\n'));
  const variants = snapshots.match(/^ {2}drizzle-orm@[^:\n]+:$/gm) ?? [];
  expect(variants).toHaveLength(1);
});
