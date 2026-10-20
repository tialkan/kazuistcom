import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { drizzle } from '../../../../../../packages/db/node_modules/drizzle-orm/pglite/index.js';
import { migrate } from '../../../../../../packages/db/node_modules/drizzle-orm/pglite/migrator.js';
import { createAuthContext, setAuthContext, type AuthContext } from '../context.ts';
import { schema, type Db } from '../db.ts';
import { authHandler } from '../handlers.ts';
import { MemoryMailer } from '../mailer.ts';
import { MemoryRateLimitStore } from '../rate-limit.ts';

export const BASE = 'http://localhost:3000';

export interface Harness {
  pg: PGlite;
  db: Db;
  ctx: AuthContext;
  mailer: MemoryMailer;
  clock: { now: Date };
}

export async function createHarness(): Promise<Harness> {
  const pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  const raw = drizzle(pg, { schema });
  await migrate(raw, { migrationsFolder });
  const db = raw as unknown as Db;
  const mailer = new MemoryMailer();
  const clock = { now: new Date() };
  const ctx = createAuthContext({
    db,
    mailer,
    store: new MemoryRateLimitStore(() => clock.now.getTime()),
    now: () => clock.now,
    config: {
      secret: 'test-secret-only-for-pglite-0123456789',
      baseUrl: BASE,
      trustedOrigins: [],
      production: false,
      trustedProxies: 1,
    },
  });
  setAuthContext(ctx);
  return { pg, db, ctx, mailer, clock };
}

let ipSeq = 0;
/** Each caller gets its own client IP so per IP limits do not leak between tests. */
export const freshIp = () => `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

export function authReq(path: string, body: unknown, ip = freshIp()): Request {
  return new Request(`${BASE}/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

/** Sign up through the real Better Auth handler and return the bearer token (iOS path). */
export async function signUp(
  email: string,
  password = 'parola-cok-gizli-1',
): Promise<{ token: string; res: Response }> {
  const res = await authHandler(authReq('/sign-up/email', { email, password, name: 'Deneme Kisi' }));
  if (res.status !== 200) throw new Error(`sign up failed ${res.status} ${await res.text()}`);
  const token = res.headers.get('set-auth-token');
  if (!token) throw new Error('no bearer token');
  return { token, res };
}

export function api(path: string, token: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body) headers.set('content-type', 'application/json');
  return new Request(`${BASE}/api${path}`, { ...init, headers });
}
