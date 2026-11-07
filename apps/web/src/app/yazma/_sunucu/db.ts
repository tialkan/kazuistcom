import { drizzle } from 'drizzle-orm/node-postgres';
import { schema, type Db } from '@/server/auth/db.ts';
import { sharedPool } from '@/server/deps.ts';

/**
 * Read-only database access for server rendered writing pages. Null without DATABASE_URL, so a page then shows
 * its empty state instead of failing the render.
 */
export function yazmaDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return drizzle(sharedPool(url), { schema }) as unknown as Db;
}
