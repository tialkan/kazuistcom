import type { APIRequestContext } from '@playwright/test';

export const base = (baseURL: string | undefined) => new URL(baseURL ?? 'http://localhost:3300').origin;

let n = 0;
/**
 * A distinct documentation-range client IP per sign up (RFC 5737), so the per-IP auth limit (30/min) does
 * not mix test users. Behind Traefik the proxy overwrites the header and the real IP counts.
 */
const ip = () => `198.51.100.${(process.pid + n++) % 250}`;

export interface Kullanici {
  email: string;
  password: string;
  token: string;
  id: string;
}

/** Sign up a throwaway example.invalid user through Better Auth; returns its bearer token. */
export async function kayit(request: APIRequestContext, baseURL: string | undefined): Promise<Kullanici> {
  const email = `guvenlik-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const password = `guvenlik-${Math.random().toString(36).slice(2)}-P1`;
  const res = await request.post('/api/auth/sign-up/email', {
    headers: { origin: base(baseURL), 'x-real-ip': ip() },
    data: { email, password, name: 'Guvenlik Deneme' },
  });
  if (res.status() !== 200) throw new Error(`sign up failed: ${res.status()}`);
  const body = (await res.json()) as { token?: string; user?: { id?: string } };
  if (!body.token || !body.user?.id) throw new Error('sign up returned no token');
  return { email, password, token: body.token, id: body.user.id };
}

export const bearer = (u: Kullanici) => ({ authorization: `Bearer ${u.token}` });

/** Signs in with e-mail and password from our own origin and returns the session cookie pair. */
export async function oturumCerezi(
  request: APIRequestContext,
  baseURL: string | undefined,
  u: Kullanici,
): Promise<string> {
  const res = await request.post('/api/auth/sign-in/email', {
    headers: { origin: base(baseURL), 'x-real-ip': ip() },
    data: { email: u.email, password: u.password },
  });
  if (res.status() !== 200) throw new Error(`sign in failed: ${res.status()}`);
  const raw = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
    .find((v) => /session_token=/.test(v));
  if (!raw) throw new Error('no session cookie');
  return raw.split(';')[0] ?? '';
}
