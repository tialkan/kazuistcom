#!/usr/bin/env node
// One-shot database migration step (plan 14.4/3, wt.141a).
// Runs as its own process before the app starts; never chained with `&&` in an app start command.
// Logs every step as JSON, holds a Postgres advisory lock so parallel deploys cannot migrate twice,
// exits 1 on failure so the deploy stops and the previous release stays up.
// Usage: DATABASE_URL=... node infra/scripts/migrate.mjs
// Modules are resolved from packages/db so the script needs no package of its own.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dbPackageJson = fileURLToPath(new URL('../../packages/db/package.json', import.meta.url));
const migrationsFolder = fileURLToPath(new URL('../../packages/db/migrations', import.meta.url));
const require = createRequire(dbPackageJson);

const LOCK_KEY = 7302514001; // constant shared by every migrate run

function log(msg, extra = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), step: 'migrate', msg, ...extra }));
}

async function appliedCount(client) {
  const r = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present");
  if (!r.rows[0].present) return 0;
  const c = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
  return c.rows[0].n;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    log('failed', { error: 'DATABASE_URL is not set' });
    process.exit(1);
  }
  const pg = require('pg');
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { migrate } = require('drizzle-orm/node-postgres/migrator');

  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8'));
  log('start', { migrations: journal.entries.map((e) => e.tag) });

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  await client.connect();
  const started = Date.now();
  try {
    log('waiting for advisory lock');
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    const before = await appliedCount(client);
    log('lock acquired', { appliedBefore: before });
    await migrate(drizzle({ client }), { migrationsFolder });
    const after = await appliedCount(client);
    log('done', { appliedBefore: before, appliedAfter: after, ms: Date.now() - started });
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  // Message and SQLSTATE only: never the connection string.
  log('failed', { error: err instanceof Error ? err.message : String(err), code: err?.code });
  process.exit(1);
});
