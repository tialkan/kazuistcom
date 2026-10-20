// Import the schema entry only: the package root also exports the migrator path, which the
// Next bundler cannot resolve.
import * as schema from '@kazuist/db/schema';
import type { PgDatabase, PgQueryResultHKT } from './orm.ts';

export type Schema = typeof schema;
/** Any Drizzle PostgreSQL database (node-postgres in production, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export { schema };
