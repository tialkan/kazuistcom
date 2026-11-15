import { logError } from '@kazuist/log';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthContext, type AuthContext } from './context.ts';
import { resolvePrincipal, type Principal } from './guard.ts';

/** Signed in caller of a server rendered account page. */
export interface PageSession {
  principal: Principal;
  ctx: AuthContext;
}

/**
 * Return path after sign in. Only a same site path is accepted (no scheme, no host, no protocol relative
 * `//` or `/\`), so `?sonra=` cannot be used as an open redirect. Anything else falls back to /hesap.
 */
export function safeNext(raw: string | string[] | null | undefined, fallback = '/hesap'): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || v.length > 200) return fallback;
  if (!/^\/(?![/\\])[A-Za-z0-9\-._~/?=&%]*$/.test(v)) return fallback;
  return v;
}

/**
 * Session of the current request for server pages, resolved with the same rules as the API guard
 * (deleted accounts read as signed out). Requests without a session cookie or bearer token skip the
 * database. A failure (no auth configuration, database down) is logged by class and reads as signed out.
 */
export async function pageSession(): Promise<PageSession | null> {
  const h = await headers();
  if (!/session_token/.test(h.get('cookie') ?? '') && !h.get('authorization')) return null;
  try {
    const ctx = await getAuthContext();
    const principal = await resolvePrincipal(new Request('http://kazuist.local/', { headers: h }), ctx);
    return principal ? { principal, ctx } : null;
  } catch (err) {
    logError('page-session', err);
    return null;
  }
}

/** Server side gate for /hesap/**: without a session the page redirects to /giris and comes back after. */
export async function requirePageSession(path: string): Promise<PageSession> {
  const s = await pageSession();
  if (!s) redirect(`/giris?sonra=${encodeURIComponent(safeNext(path))}`);
  return s;
}
