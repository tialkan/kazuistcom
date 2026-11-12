import { getMe } from '@/server/auth/account';
import { pageSession } from '@/server/auth/page-session';
import { findProfession } from '@/server/auth/professions';
import type { KabukOturumu } from './oturum.ts';

/**
 * Session of the current request for the shell. Without a session cookie `pageSession` returns before the
 * database. A deleted account reads as a guest. When the profile cannot be read the user is still shown as
 * signed in, without name or target, and only the error class is logged (no personal data).
 */
export async function kabukOturumu(): Promise<KabukOturumu | null> {
  const s = await pageSession();
  if (!s) return null;
  try {
    const me = await getMe(s.ctx, s.principal.userId);
    if (!me) return null;
    const ad = me.name?.trim() || null;
    const hedef = me.targetProfession ? (findProfession(me.targetProfession)?.label ?? null) : null;
    return { ad, hedef, avatar: me.avatar };
  } catch (err) {
    console.error(
      JSON.stringify({
        at: 'kabuk-oturum',
        level: 'error',
        error: err instanceof Error ? err.name : 'Unknown',
      }),
    );
    return { ad: null, hedef: null, avatar: null };
  }
}
