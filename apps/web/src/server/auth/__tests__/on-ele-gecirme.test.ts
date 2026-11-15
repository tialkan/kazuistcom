import { createOTP } from '@better-auth/utils/otp';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthConfig } from '../auth.ts';
import { schema } from '../db.ts';
import { authHandler, meGet } from '../handlers.ts';
import { stripPlan } from '../unproven.ts';
import { api, authReq, BASE, createHarness, freshIp, signUp, type Harness } from './harness.ts';

/**
 * Account pre-hijacking (independent audit, finding 1): an attacker opens an account on the victim's address with
 * a password, then sets up a passkey and TOTP. When the victim first proves the address (e-mail code sign in,
 * address verification, password reset) nothing the attacker set up may remain usable. Google never attaches to
 * the unproven account.
 */

let h: Harness;
const body = async (r: Response) => JSON.parse(await r.text());
// Built at run time so no password-like literal is committed (gitleaks generic-api-key).
const attackerPassword = ['saldirgan', 'parola', String(Date.now())].join('-');

/** Google provider whose id token check and profile are local: the profile says the victim's address, verified. */
const google = {
  clientId: 'test-client',
  clientSecret: 'test-secret',
  verifyIdToken: async () => true,
  getUserInfo: async (token: { idToken?: string }) => ({
    user: { id: `g-${token.idToken}`, email: token.idToken ?? '', name: 'Kurban', emailVerified: true },
    data: { sub: `g-${token.idToken}`, email: token.idToken ?? '', email_verified: true },
  }),
} as unknown as AuthConfig['google'];

beforeAll(async () => {
  h = await createHarness({ config: { google } });
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

function base32Decode(s: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes).toString('utf8');
}

/** The attacker's account on the victim's address: password, an extra session, TOTP and a passkey. */
async function attackerAccount(email: string): Promise<{ id: string; tokens: string[] }> {
  const { token } = await signUp(email, attackerPassword);
  const id = (await body(await meGet(api('/v1/me', token)))).id as string;
  const auth = () => new Headers({ authorization: `Bearer ${token}` });
  const en = (await h.ctx.auth.api.enableTwoFactor({
    body: { password: attackerPassword },
    headers: auth(),
  })) as { totpURI: string };
  const secret = base32Decode(new URL(en.totpURI).searchParams.get('secret') ?? '');
  const v = await h.ctx.auth.api.verifyTOTP({
    body: { code: await createOTP(secret).totp() },
    headers: auth(),
    returnHeaders: true,
  });
  const second = v.headers.get('set-auth-token') ?? token;
  // A passkey as the passkey plugin stores it after a registration ceremony.
  await h.db.insert(schema.passkeys).values({
    userId: id,
    name: 'saldirgan',
    publicKey: 'cHVibGljLWtleQ',
    credentialId: `cred-${id}`,
    counter: 0,
  });
  const [u] = await h.db.select().from(schema.users).where(eq(schema.users.id, id));
  expect(u).toMatchObject({ emailVerified: false, twoFactorEnabled: true });
  return { id, tokens: [token, second] };
}

async function expectNothingLeft(id: string, email: string, tokens: string[]) {
  for (const t of tokens) expect((await meGet(api('/v1/me', t))).status).toBe(401);
  const pw = await authHandler(authReq('/sign-in/email', { email, password: attackerPassword }));
  expect(pw.status).toBe(401);
  expect(await h.db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, id))).toHaveLength(0);
  expect(await h.db.select().from(schema.twoFactors).where(eq(schema.twoFactors.userId, id))).toHaveLength(0);
  const [u] = await h.db.select().from(schema.users).where(eq(schema.users.id, id));
  expect(u).toMatchObject({ emailVerified: true, twoFactorEnabled: false });
}

async function code(email: string, type: 'sign-in' | 'email-verification' | 'forget-password') {
  const path =
    type === 'forget-password' ? '/email-otp/request-password-reset' : '/email-otp/send-verification-otp';
  const res = await authHandler(authReq(path, type === 'forget-password' ? { email } : { email, type }));
  expect(res.status).toBe(200);
  return h.mailer.last(email, type)?.code ?? '';
}

describe('first proof of the address strips what the attacker set up', () => {
  it('e-mail code sign in: password, sessions, passkey and TOTP are gone; the victim is in', async () => {
    const email = 'kurban-kod@example.invalid';
    const a = await attackerAccount(email);
    const res = await authHandler(
      authReq('/sign-in/email-otp', { email, otp: await code(email, 'sign-in') }),
    );
    expect(res.status).toBe(200);
    const victim = res.headers.get('set-auth-token') ?? '';
    await expectNothingLeft(a.id, email, a.tokens);
    expect((await meGet(api('/v1/me', victim))).status).toBe(200);
    const audit = await h.db
      .select()
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.subjectId, a.id), eq(schema.auditLog.action, 'user.unproven_access_revoked')),
      );
    expect(audit).toHaveLength(1);
  });

  it('address verification without a session of the account: everything goes', async () => {
    const email = 'kurban-dogrula@example.invalid';
    const a = await attackerAccount(email);
    const res = await authHandler(
      authReq('/email-otp/verify-email', { email, otp: await code(email, 'email-verification') }),
    );
    expect(res.status).toBe(200);
    await expectNothingLeft(a.id, email, a.tokens);
  });

  it('password reset: the attacker loses sessions, passkey and TOTP; the new password signs in without TOTP', async () => {
    const email = 'kurban-sifirla@example.invalid';
    const a = await attackerAccount(email);
    const fresh = ['kurban', 'yeni', String(Date.now())].join('-');
    const otp = await code(email, 'forget-password');
    const res = await authHandler(authReq('/email-otp/reset-password', { email, otp, password: fresh }));
    expect(res.status).toBe(200);
    await expectNothingLeft(a.id, email, a.tokens);
    const signIn = await authHandler(authReq('/sign-in/email', { email, password: fresh }));
    expect(signIn.status).toBe(200);
    expect((await body(signIn)).twoFactorRedirect).toBeUndefined();
  });

  it('the owner verifying from the sign up session keeps the password and that session only', async () => {
    const email = 'sahip@example.invalid';
    const { token } = await signUp(email, attackerPassword);
    const other = await authHandler(authReq('/sign-in/email', { email, password: attackerPassword }));
    const otherToken = other.headers.get('set-auth-token') ?? '';
    expect((await meGet(api('/v1/me', otherToken))).status).toBe(200);
    const otp = await code(email, 'email-verification');
    const res = await authHandler(
      new Request(`${BASE}/api/auth/email-otp/verify-email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: BASE,
          'x-forwarded-for': freshIp(),
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, otp }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await meGet(api('/v1/me', token))).status).toBe(200);
    expect((await meGet(api('/v1/me', otherToken))).status).toBe(401);
    const pw = await authHandler(authReq('/sign-in/email', { email, password: attackerPassword }));
    expect(pw.status).toBe(200);
  });

  it('an already verified account is not touched by a later code sign in', async () => {
    const email = 'dogrulanmis@example.invalid';
    const { token } = await signUp(email, attackerPassword);
    await authHandler(authReq('/sign-in/email-otp', { email, otp: await code(email, 'sign-in') }));
    const again = await authHandler(authReq('/sign-in/email', { email, password: attackerPassword }));
    // The first code sign in proved the address and dropped the unproven password (Better Auth and unproven.ts).
    expect(again.status).toBe(401);
    expect((await meGet(api('/v1/me', token))).status).toBe(401);
    const fresh = ['dogrulanmis', 'yeni', String(Date.now())].join('-');
    const otp = await code(email, 'forget-password');
    expect(
      (await authHandler(authReq('/email-otp/reset-password', { email, otp, password: fresh }))).status,
    ).toBe(200);
    const s = await authHandler(authReq('/sign-in/email', { email, password: fresh }));
    expect(s.status).toBe(200);
    const t = s.headers.get('set-auth-token') ?? '';
    await authHandler(authReq('/sign-in/email-otp', { email, otp: await code(email, 'sign-in') }));
    // Verified now: a further code sign in leaves the password and sessions alone.
    expect((await meGet(api('/v1/me', t))).status).toBe(200);
    expect((await authHandler(authReq('/sign-in/email', { email, password: fresh }))).status).toBe(200);
  });
});

describe('Google sign in on an address someone else registered', () => {
  const googleSignIn = (email: string) =>
    authHandler(authReq('/sign-in/social', { provider: 'google', idToken: { token: email } }));

  it('does not attach to the unproven account; after the code proof it links and the attacker is out', async () => {
    const email = 'kurban-google@example.invalid';
    const a = await attackerAccount(email);
    const refused = await googleSignIn(email);
    expect(refused.status).toBe(401);
    const links = await h.db
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.userId, a.id), eq(schema.accounts.providerId, 'google')));
    expect(links).toHaveLength(0);

    await authHandler(authReq('/sign-in/email-otp', { email, otp: await code(email, 'sign-in') }));
    await expectNothingLeft(a.id, email, a.tokens);
    const ok = await googleSignIn(email);
    expect(ok.status).toBe(200);
    expect((await meGet(api('/v1/me', ok.headers.get('set-auth-token') ?? ''))).status).toBe(200);
  });

  it('a new Google account arrives verified and is untouched', async () => {
    const res = await googleSignIn('yeni-google@example.invalid');
    expect(res.status).toBe(200);
  });
});

describe('strip plan', () => {
  it('per endpoint', () => {
    expect(stripPlan('/sign-in/email-otp', false)).toEqual({
      password: true,
      oauth: true,
      passkeys: true,
      totp: true,
      sessions: 'all',
    });
    expect(stripPlan('/email-otp/reset-password', false)).toMatchObject({
      password: false,
      sessions: 'none',
    });
    expect(stripPlan('/email-otp/verify-email', true)).toEqual({
      password: false,
      oauth: false,
      passkeys: false,
      totp: false,
      sessions: 'others',
    });
    expect(stripPlan('/email-otp/verify-email', false)).toMatchObject({ password: true, sessions: 'all' });
  });
});
