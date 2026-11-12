import type { ConsentKind } from '@kazuist/contracts';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { hukukiMetinSurumu } from '@/app/(kabuk)/_hukuki/yukle';
import { listConsents } from './account.ts';
import type { AuthContext } from './context.ts';
import { schema } from './db.ts';
import type { Principal } from './guard.ts';
import { hasAnyRole } from './roles.ts';
import { hasPasskeySession, hasSecondStep, hasTotpEnabled } from './step-up.ts';

/** Read models for the server rendered account pages (/hesap/**). Writes always go through the API. */

/** Texts every account accepts (kayit form and the /hesap reminder); version = front matter version. */
export const requiredConsentTexts = [
  { kind: 'kullanim_kosullari', slug: 'kosullar' },
  { kind: 'aydinlatma', slug: 'aydinlatma' },
] as const satisfies readonly { kind: ConsentKind; slug: string }[];

export interface RequiredConsent {
  kind: (typeof requiredConsentTexts)[number]['kind'];
  version: string;
}

/** Current versions from content/hukuki; a missing text is a deployment error and throws. */
export function currentRequiredConsents(): RequiredConsent[] {
  return requiredConsentTexts.map(({ kind, slug }) => {
    const version = hukukiMetinSurumu(slug);
    if (!version) throw new Error(`legal text ${slug} not found`);
    return { kind, version };
  });
}

/**
 * Required texts whose current version the user has not accepted: no row, a withdrawal as the latest
 * row, or acceptance of an older version. Accounts opened by e-mail code, Google, Apple or iOS see the
 * reminder on /hesap because those flows have no consent box.
 */
export async function pendingConsents(
  ctx: AuthContext,
  userId: string,
  required: RequiredConsent[] = currentRequiredConsents(),
): Promise<RequiredConsent[]> {
  const latest = new Map<string, { version: string; granted: boolean }>();
  for (const c of await listConsents(ctx, userId)) latest.set(c.kind, c);
  return required.filter((r) => {
    const l = latest.get(r.kind);
    return !l || !l.granted || l.version !== r.version;
  });
}

export interface SecurityStatus {
  /** A credential account exists, so enabling TOTP asks for the password. */
  hasPassword: boolean;
  totpEnabled: boolean;
  /** editor or yonetici: the admin step up section is shown. */
  staff: boolean;
  passkeySession: boolean;
  secondStep: boolean;
}

export async function securityStatus(ctx: AuthContext, p: Principal): Promise<SecurityStatus> {
  const [credential] = await ctx.db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.userId, p.userId),
        eq(schema.accounts.providerId, 'credential'),
        isNotNull(schema.accounts.password),
      ),
    )
    .limit(1);
  const staff = hasAnyRole(p.roles, ['editor', 'yonetici']);
  return {
    hasPassword: !!credential,
    totpEnabled: await hasTotpEnabled(ctx.db, p.userId),
    staff,
    passkeySession: staff ? await hasPasskeySession(ctx.db, p.sessionId, p.userId) : false,
    secondStep: staff ? await hasSecondStep(ctx.db, p.sessionId, p.userId, ctx.now()) : false,
  };
}

/** Passkeys of the caller for /hesap/guvenlik; never the public key or counter. */
export async function listOwnPasskeys(ctx: AuthContext, userId: string) {
  const rows = await ctx.db
    .select({ id: schema.passkeys.id, name: schema.passkeys.name, createdAt: schema.passkeys.createdAt })
    .from(schema.passkeys)
    .where(eq(schema.passkeys.userId, userId))
    .orderBy(asc(schema.passkeys.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? null,
    createdAt: (r.createdAt ?? new Date(0)).toISOString(),
  }));
}
