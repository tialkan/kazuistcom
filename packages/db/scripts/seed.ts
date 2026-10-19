import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { migrationsFolder } from '../src/migrate.ts';
import { seed } from '../src/seed.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (see .env.example).');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
const db = drizzle(pool);
await migrate(db, { migrationsFolder });
await seed(db);
await pool.end();
console.log('Seed complete.');
