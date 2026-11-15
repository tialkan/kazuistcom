import { createOTP } from '@better-auth/utils/otp';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createAuthContext, setAuthContext, type AuthContext } from '../context.ts';
import { schema, type Db } from '../db.ts';
import { authHandler, meGet, stepUpConfirm } from '../handlers.ts';
import type { StoredRole } from '../roles.ts';
import { MemoryMailer } from '../mailer.ts';
import { MemoryRateLimitStore } from '../rate-limit.ts';

export const BASE = 'http://localhost:3000';

export interface Harness {
  pg: PGlite;
  db: Db;
  ctx: AuthContext;
  mailer: MemoryMailer;
  clock: { now: Date };
  /** Account hook calls (odeme promo and deletion), in order. */
  hookCalls: string[];
}

export async function createHarness(): Promise<Harness> {
  const pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  const raw = drizzle(pg, { schema });
  await migrate(raw, { migrationsFolder });
  const db = raw as unknown as Db;
  const mailer = new MemoryMailer();
  const clock = { now: new Date() };
  const hookCalls: string[] = [];
  const ctx = createAuthContext({
    db,
    mailer,
    hooks: {
      onSignup: async (id) => {
        hookCalls.push(`signup:${id}`);
      },
      onDeletion: async (id) => {
        hookCalls.push(`deletion:${id}`);
      },
    },
    store: new MemoryRateLimitStore(() => clock.now.getTime()),
    now: () => clock.now,
    config: {
      secret: 'test-secret-only-for-pglite-0123456789',
      baseUrl: BASE,
      trustedOrigins: [],
      production: false,
      trustedProxies: 1,
      piiKey: Buffer.alloc(32, 7).toString('base64'),
      purgeGraceDays: 14,
    },
  });
  setAuthContext(ctx);
  return { pg, db, ctx, mailer, clock, hookCalls };
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
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', freshIp());
  return new Request(`${BASE}/api${path}`, { ...init, headers });
}

/** Next.js route context for handlers with dynamic segments. */
export const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

function base32Decode(s: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes).toString('utf8');
}

/**
 * A staff account ready for admin endpoints: the role, a session marked as opened with a passkey (as the passkey
 * hook writes it), TOTP enrolled and, unless `stepUp` is false, the admin second step confirmed for the session.
 */
export async function staffUser(
  h: Harness,
  email: string,
  role: StoredRole = 'editor',
  stepUp = true,
): Promise<{ token: string; id: string; secret: string }> {
  let { token } = await signUp(email);
  const id = (JSON.parse(await (await meGet(api('/v1/me', token))).text()) as { id: string }).id;
  await h.db.insert(schema.userRoles).values({ userId: id, roleId: role });
  await h.db.update(schema.sessions).set({ authMethod: 'passkey' }).where(eq(schema.sessions.userId, id));
  const auth = () => new Headers({ authorization: `Bearer ${token}` });
  const en = (await h.ctx.auth.api.enableTwoFactor({
    body: { password: 'parola-cok-gizli-1' },
    headers: auth(),
  })) as { totpURI: string };
  const secret = base32Decode(new URL(en.totpURI).searchParams.get('secret') ?? '');
  const res = await h.ctx.auth.api.verifyTOTP({
    body: { code: await createOTP(secret).totp() },
    headers: auth(),
    returnHeaders: true,
  });
  token = res.headers.get('set-auth-token') ?? token;
  if (stepUp) {
    const r = await stepUpConfirm(
      api('/auth/step-up/confirm', token, {
        method: 'POST',
        body: JSON.stringify({ code: await createOTP(secret).totp() }),
      }),
    );
    if (r.status !== 204) throw new Error(`step up failed ${r.status}`);
  }
  return { token, id, secret };
}
