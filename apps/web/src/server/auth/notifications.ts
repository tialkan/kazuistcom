import type {
  ApnsTokenInput,
  NotificationPreferencesInput,
  NotificationPrefsColumn,
  NotificationType,
  WebPushSubscriptionInput,
} from '@kazuist/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { writeAudit } from './audit.ts';
import type { AuthContext } from './context.ts';
import { schema } from './db.ts';
import type { Principal } from './guard.ts';

/**
 * Notification preferences and push targets (plan 10.8, 10.10; contract /v1/notifications/preferences,
 * /v1/push/web-subscriptions, /v1/push/apns-tokens). The worker (apps/worker-node/src/notify) reads the same
 * rows: notification_prefs per channel `{ "<type>": boolean }`, a missing type means its default, and
 * push_subscriptions per device.
 */

export type NotificationPreferences = z.infer<typeof NotificationPreferencesInput>;

/**
 * E-mail types the user cannot turn off (payment and cancellation). Kept equal to the worker's
 * mandatoryEmailTypes by test (notify/types.ts); a stored false for them is dropped so GET shows what is sent.
 */
export const mandatoryEmailTypes: readonly NotificationType[] = ['odeme', 'fesih_teyidi'];

const clean = (col: NotificationPrefsColumn | undefined, drop: readonly NotificationType[] = []) =>
  Object.fromEntries(
    Object.entries(col ?? {}).filter(([k]) => !drop.includes(k as NotificationType)),
  ) as NotificationPrefsColumn;

export async function getNotificationPreferences(
  ctx: AuthContext,
  userId: string,
): Promise<Required<NotificationPreferences>> {
  const [row] = await ctx.db
    .select()
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, userId));
  return {
    email: clean(row?.email, mandatoryEmailTypes),
    webPush: clean(row?.webPush),
    apns: clean(row?.apns),
  };
}

/**
 * PUT semantics per channel: a channel in the body replaces that channel's map, a channel left out keeps its
 * stored map. The change is audited with channel names only (consent evidence for kampanya, plan 10.8).
 */
export async function setNotificationPreferences(
  ctx: AuthContext,
  p: Principal,
  input: NotificationPreferences,
): Promise<Required<NotificationPreferences>> {
  const set: Partial<Record<'email' | 'webPush' | 'apns', NotificationPrefsColumn>> = {};
  if (input.email) set.email = clean(input.email, mandatoryEmailTypes);
  if (input.webPush) set.webPush = clean(input.webPush);
  if (input.apns) set.apns = clean(input.apns);
  const now = ctx.now();
  await ctx.db
    .insert(schema.notificationPrefs)
    .values({ userId: p.userId, ...set, updatedAt: now })
    .onConflictDoUpdate({ target: schema.notificationPrefs.userId, set: { ...set, updatedAt: now } });
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId: p.userId,
    action: 'notifications.preferences.set',
    subjectType: 'notification_prefs',
    subjectId: p.userId,
    diff: set,
  });
  return getNotificationPreferences(ctx, p.userId);
}

/** At most this many devices per user and channel; the oldest registration goes first. */
export const PUSH_TARGETS_PER_CHANNEL = 10;

/**
 * Web Push endpoints the worker may call. The worker POSTs to the stored endpoint, so an arbitrary URL would let
 * a user point it at internal addresses (SSRF); only the browsers' push services are accepted, over https.
 */
const pushHosts = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
];
const pushHostSuffixes = ['.notify.windows.com', '.push.apple.com'];

export function pushEndpointAllowed(endpoint: string): boolean {
  if (endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    return false;
  const host = url.hostname.toLowerCase();
  return pushHosts.includes(host) || pushHostSuffixes.some((s) => host.endsWith(s));
}

const b64url = /^[A-Za-z0-9_-]+={0,2}$/;
/** RFC 8291: p256dh is an uncompressed P-256 point (65 bytes), auth a 16 byte secret, both base64url. */
function keyBytes(v: string): number {
  return b64url.test(v) ? Buffer.from(v.replace(/=+$/, ''), 'base64url').length : -1;
}
export const webPushKeysValid = (k: { p256dh: string; auth: string }) =>
  keyBytes(k.p256dh) === 65 && keyBytes(k.auth) === 16;

type Channel = 'web_push' | 'apns';

/**
 * One row per device. A target already stored (for this or another account) moves to the caller: the browser or
 * phone now belongs to whoever signed in on it, and the previous account must not receive its notifications.
 * The audit row names the channel only, never the endpoint or token.
 */
async function registerTarget(
  ctx: AuthContext,
  p: Principal,
  channel: Channel,
  endpoint: string,
  extra: { keys?: { p256dh: string; auth: string }; environment?: 'production' | 'sandbox' },
): Promise<string> {
  const id = await ctx.db.transaction(async (tx) => {
    await tx
      .delete(schema.pushSubscriptions)
      .where(
        and(eq(schema.pushSubscriptions.channel, channel), eq(schema.pushSubscriptions.endpoint, endpoint)),
      );
    const [row] = await tx
      .insert(schema.pushSubscriptions)
      .values({
        userId: p.userId,
        channel,
        endpoint,
        keys: extra.keys ?? null,
        environment: extra.environment ?? null,
        createdAt: ctx.now(),
      })
      .returning({ id: schema.pushSubscriptions.id });
    if (!row) throw new Error('push subscription insert failed');
    const own = await tx
      .select({ id: schema.pushSubscriptions.id })
      .from(schema.pushSubscriptions)
      .where(
        and(eq(schema.pushSubscriptions.userId, p.userId), eq(schema.pushSubscriptions.channel, channel)),
      )
      .orderBy(asc(schema.pushSubscriptions.createdAt), asc(schema.pushSubscriptions.id));
    const excess = own
      .filter((r) => r.id !== row.id)
      .slice(0, Math.max(0, own.length - PUSH_TARGETS_PER_CHANNEL));
    if (excess.length) {
      await tx.delete(schema.pushSubscriptions).where(
        inArray(
          schema.pushSubscriptions.id,
          excess.map((r) => r.id),
        ),
      );
    }
    return row.id;
  });
  await writeAudit(ctx.db, ctx.config.secret, {
    actorId: p.userId,
    action: 'push.register',
    subjectType: 'push_subscription',
    subjectId: id,
    diff: { channel },
  });
  return id;
}

export async function registerWebPush(
  ctx: AuthContext,
  p: Principal,
  input: z.infer<typeof WebPushSubscriptionInput>,
): Promise<string | 'invalid'> {
  if (!pushEndpointAllowed(input.endpoint) || !webPushKeysValid(input.keys)) return 'invalid';
  return registerTarget(ctx, p, 'web_push', input.endpoint, { keys: input.keys });
}

export async function registerApnsToken(
  ctx: AuthContext,
  p: Principal,
  input: z.infer<typeof ApnsTokenInput>,
): Promise<string> {
  return registerTarget(ctx, p, 'apns', input.deviceToken, { environment: input.environment });
}
