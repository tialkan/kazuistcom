/**
 * Temporary: re-export drizzle-orm from the exact instance @kazuist/db uses. better-auth brings
 * kysely, so pnpm resolves a second drizzle-orm peer variant for apps/web whose column types are
 * incompatible with the schema objects. Remove once docs/istekler/kimlik-drizzle-tek-kopya.md
 * is applied and import from 'drizzle-orm' directly.
 */
export {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
} from '../../../../../packages/db/node_modules/drizzle-orm/index.js';
export { drizzle as drizzleNodePg } from '../../../../../packages/db/node_modules/drizzle-orm/node-postgres/index.js';
export type {
  PgDatabase,
  PgQueryResultHKT,
} from '../../../../../packages/db/node_modules/drizzle-orm/pg-core/index.js';
