import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  currentRequiredConsents,
  listOwnPasskeys,
  pendingConsents,
  securityStatus,
} from '../account-view.ts';
import { schema } from '../db.ts';
import { resolvePrincipal } from '../guard.ts';
import { authHandler, consentsPost, meGet } from '../handlers.ts';
import { safeNext } from '../page-session.ts';
import { api, authReq, BASE, createHarness, freshIp, signUp, type Harness } from './harness.ts';

/** P7: read models and flows behind the /hesap pages, /giris, /kayit and /parola-sifirla. */
let h: Harness;
const body = async (r: Response) => JSON.parse(await r.text());

beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

describe('safeNext: the ?sonra= return path is never an open redirect', () => {
  it.each([
    ['/hesap/kvkk', '/hesap/kvkk'],
    ['/kaydettiklerim?sayfa=2', '/kaydettiklerim?sayfa=2'],
    [undefined, '/hesap'],
    ['', '/hesap'],
    ['https://evil.example/', '/hesap'],
    ['//evil.example/', '/hesap'],
    ['/\\evil.example', '/hesap'],
    ['javascript:alert(1)', '/hesap'],
    ['/a b', '/hesap'],
    [`/${'a'.repeat(250)}`, '/hesap'],
    [['/hesap/hedef', '/x'], '/hesap/hedef'],
  ])('%s -> %s', (raw, want) => {
    expect(safeNext(raw as string | string[] | undefined)).toBe(want);
  });
});

describe('consent reminder on /hesap', () => {
  it('reads current versions from content/hukuki front matter', () => {
    const c = currentRequiredConsents();
    expect(c.map((x) => x.kind)).toEqual(['kullanim_kosullari', 'aydinlatma']);
    for (const x of c) expect(x.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it('is pending until the current version of both texts is granted, and again after a withdrawal', async () => {
    const { token } = await signUp('riza@example.invalid');
    const id = (await body(await meGet(api('/v1/me', token)))).id as string;
    const required = [
      { kind: 'kullanim_kosullari' as const, version: '2026-10-23.1' },
      { kind: 'aydinlatma' as const, version: '2026-10-23.1' },
    ];
    expect(await pendingConsents(h.ctx, id, required)).toEqual(required);
    const give = (kind: string, version: string, granted = true) =>
      consentsPost(
        api('/v1/me/consents', token, {
          method: 'POST',
          body: JSON.stringify({ kind, version, granted }),
        }),
      );
    expect((await give('kullanim_kosullari', '2026-10-23.1')).status).toBe(201);
    expect((await give('aydinlatma', '2026-01-01.1')).status).toBe(201);
    // An older version does not count.
    expect(await pendingConsents(h.ctx, id, required)).toEqual([required[1]]);
    await give('aydinlatma', '2026-10-23.1');
    expect(await pendingConsents(h.ctx, id, required)).toEqual([]);
    await give('kullanim_kosullari', '2026-10-23.1', false);
    expect(await pendingConsents(h.ctx, id, required)).toEqual([required[0]]);
    // A newer published version asks again.
    expect(await pendingConsents(h.ctx, id, [{ kind: 'aydinlatma', version: '2026-12-01.1' }])).toHaveLength(
      1,
    );
  });
});

describe('security page read model', () => {
  const principalOf = async (token: string) => {
    const p = await resolvePrincipal(
      new Request(`${BASE}/`, { headers: { authorization: `Bearer ${token}` } }),
      h.ctx,
    );
    if (!p) throw new Error('no principal');
    return p;
  };

  it('a password account needs the password for TOTP and is not staff', async () => {
    const { token } = await signUp('guvenlik@example.invalid');
    const s = await securityStatus(h.ctx, await principalOf(token));
    expect(s).toEqual({
      hasPassword: true,
      totpEnabled: false,
      staff: false,
      passkeySession: false,
      secondStep: false,
    });
  });

  it('staff signed in with a password sees that the passkey session is missing', async () => {
    const { token } = await signUp('editor-guvenlik@example.invalid');
    const p = await principalOf(token);
    await h.db.insert(schema.userRoles).values({ userId: p.userId, roleId: 'editor' });
    const s = await securityStatus(h.ctx, await principalOf(token));
    expect(s.staff).toBe(true);
    expect(s.passkeySession).toBe(false);
    expect(s.secondStep).toBe(false);
  });

  it('lists only the caller passkeys and never the public key', async () => {
    const a = await principalOf((await signUp('pk-a@example.invalid')).token);
    const b = await principalOf((await signUp('pk-b@example.invalid')).token);
    await h.db.insert(schema.passkeys).values([
      { userId: a.userId, name: 'Dizüstü', publicKey: 'pk-a', credentialId: 'cred-a' },
      { userId: b.userId, name: 'Telefon', publicKey: 'pk-b', credentialId: 'cred-b' },
    ]);
    const list = await listOwnPasskeys(h.ctx, a.userId);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Dizüstü');
    expect(Object.keys(list[0] ?? {}).sort()).toEqual(['createdAt', 'id', 'name']);
  });
});

describe('password reset by e-mail code (/parola-sifirla)', () => {
  it('resets the password and ends every other session', async () => {
    const email = 'sifirla@example.invalid';
    // Built at run time so no password-like literal is committed (gitleaks generic-api-key).
    const yeniParola = ['yeni', 'parola', 'deneme', String(Date.now())].join('-');
    const { token } = await signUp(email);
    expect((await meGet(api('/v1/me', token))).status).toBe(200);
    const ask = await authHandler(authReq('/email-otp/request-password-reset', { email }));
    expect(ask.status).toBe(200);
    const code = h.mailer.last(email, 'forget-password')?.code ?? '';
    expect(code).toMatch(/^\d{6}$/);
    const reset = await authHandler(
      authReq('/email-otp/reset-password', { email, otp: code, password: yeniParola }),
    );
    expect(reset.status).toBe(200);
    expect((await meGet(api('/v1/me', token))).status).toBe(401);
    const old = await authHandler(authReq('/sign-in/email', { email, password: 'parola-cok-gizli-1' }));
    expect(old.status).toBe(401);
    const fresh = await authHandler(authReq('/sign-in/email', { email, password: yeniParola }));
    expect(fresh.status).toBe(200);
  });

  it('answers the same for an unknown address', async () => {
    const r = await authHandler(
      authReq('/email-otp/request-password-reset', { email: 'yok@example.invalid' }),
    );
    expect(r.status).toBe(200);
    expect(h.mailer.last('yok@example.invalid')).toBeUndefined();
  });

  it('reset code requests share the strict per IP code limit', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await authHandler(
        authReq('/email-otp/request-password-reset', { email: `limit${i}@example.invalid` }, ip),
      );
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
