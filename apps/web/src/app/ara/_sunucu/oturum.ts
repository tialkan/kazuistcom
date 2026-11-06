import { headers } from 'next/headers';
import { getAuthContext, type AuthContext } from '@/server/auth/context';
import { resolvePrincipal, type Principal } from '@/server/auth/guard';

export interface Oturum {
  principal: Principal | null;
  ctx: AuthContext | null;
}

/**
 * Signed in user for server pages. Requests without a session cookie or bearer token skip the database; any
 * failure (no auth configuration in local development, database down) reads as signed out.
 */
export async function oturum(): Promise<Oturum> {
  const h = await headers();
  if (!/session_token/.test(h.get('cookie') ?? '') && !h.get('authorization'))
    return { principal: null, ctx: null };
  try {
    const ctx = await getAuthContext();
    const principal = await resolvePrincipal(new Request('http://kazuist.local/', { headers: h }), ctx);
    return { principal, ctx };
  } catch {
    return { principal: null, ctx: null };
  }
}
