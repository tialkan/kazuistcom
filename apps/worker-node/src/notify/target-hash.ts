import { createHmac, hkdfSync } from 'node:crypto';

/**
 * Keyed hash of a push target for notification_deliveries (ADR-0035). The table stores HMAC-SHA256 of the Web
 * Push endpoint or the APNs device token as 64 lower case hex characters, never the raw value. The key is
 * derived from BETTER_AUTH_SECRET with HKDF (info `notification-target`), so no new secret is needed and the
 * hash cannot be joined with the subject hashes made from the same secret.
 */
export const TARGET_KEY_INFO = 'notification-target';

export function notifyTargetKey(secret: string): Uint8Array {
  if (!secret) throw new Error('notify target key needs a secret');
  return new Uint8Array(hkdfSync('sha256', secret, new Uint8Array(0), TARGET_KEY_INFO, 32));
}

export function targetHash(key: Uint8Array, target: string): string {
  return createHmac('sha256', key).update(target, 'utf8').digest('hex');
}

/** Key from the environment when the caller passed none (main.ts wiring stays unchanged). */
export function targetKeyFromEnv(
  env: Record<string, string | undefined> = process.env,
): Uint8Array | undefined {
  return env.BETTER_AUTH_SECRET ? notifyTargetKey(env.BETTER_AUTH_SECRET) : undefined;
}
