import { z } from 'zod';
import { BillingNoticeKind } from './billing.ts';
import type { JobType } from './schemas.ts';

/**
 * Job payload schemas (plan Ek C.3, ADR-0023). Producers in Node and Python write exactly these shapes;
 * payloads carry ids, never personal data or text. Types without an entry here keep their owner's local
 * schema until it is promoted through a request (docs/istekler).
 */

/** Notification kinds (plan 10.8). Only `kampanya` is a commercial electronic message (6563, IYS). */
export const notificationTypes = [
  'teslim_hatirlatmasi',
  'kalemcik',
  'tam_metin_istegi',
  'tam_metin_cevabi',
  'takip',
  'odeme',
  'fesih_teyidi',
  'mevzuat_degisikligi',
  'kampanya',
] as const;
export const NotificationType = z.enum(notificationTypes);
export type NotificationType = z.infer<typeof NotificationType>;

export const notificationChannels = ['email', 'web_push', 'apns'] as const;
export const NotificationChannel = z.enum(notificationChannels);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

/**
 * One column of notification_prefs (email, web_push, apns): `{ "<notification type>": boolean }`.
 * A missing key means the type's default (kimlik notify/prefs.ts).
 */
export const NotificationPrefsColumn = z.partialRecord(NotificationType, z.boolean());
export type NotificationPrefsColumn = z.infer<typeof NotificationPrefsColumn>;

/** push_subscriptions.channel and .environment (the environment is set for apns only). */
export const pushChannels = ['web_push', 'apns'] as const;
export const apnsEnvironments = ['production', 'sandbox'] as const;

/** notify.send payload. The worker renders the text from i18n; no text or address is queued. */
export const NotifyPayload = z
  .strictObject({
    type: NotificationType,
    /**
     * Template of a billing notice (v1.2, ADR-0026). Only with type odeme; preferences stay per type.
     * Producers before v1.2 encode it as the refId prefix (<subtype>:<ref>), which renderers still accept.
     */
    subtype: BillingNoticeKind.optional(),
    userId: z.uuid(),
    refId: z.string().max(100).optional(),
    /** Restrict to some channels; default every channel the user allows. */
    channels: z.array(NotificationChannel).optional(),
  })
  .refine((p) => p.subtype === undefined || p.type === 'odeme', {
    message: 'subtype is only allowed with type odeme',
    path: ['subtype'],
  });
export type NotifyPayload = z.infer<typeof NotifyPayload>;

/**
 * account.purge payload. Enqueued by DELETE /v1/me with run_after = deletion time + grace period
 * (ADR-0023: at most 30 days, KVKK m.13/2). The handler deletes the users row; consents and audit_log keep
 * only the hash (ON DELETE SET NULL), billing records are kept as the law requires.
 */
export const AccountPurgePayload = z.strictObject({ userId: z.uuid() });
export type AccountPurgePayload = z.infer<typeof AccountPurgePayload>;

/** anon.run payload (services/worker-py/anonymizer/job.py). */
export const AnonRunPayload = z.strictObject({ recordId: z.uuid() });

/**
 * embed.chunks payload (v1.2, ADR-0026). Enqueued with dedupe key embed:<recordId> by anon.run and by the
 * records trigger whenever masked_text gets a value. The consumer embeds records.masked_text only; it
 * remembers md5(masked_text) when it reads and, in the write transaction, locks the record row and writes the
 * chunks only if the hash is unchanged, otherwise it fails the job so the retry reads the new text. Chunks of
 * a record are deleted by the records trigger whenever masked_text changes or becomes NULL (fail closed).
 */
export const EmbedChunksPayload = z.strictObject({ recordId: z.uuid() });
export type EmbedChunksPayload = z.infer<typeof EmbedChunksPayload>;

/** billing.reconcile payload: the UTC day to reconcile, default yesterday. */
export const BillingReconcilePayload = z.strictObject({ day: z.iso.date().optional() });

export const jobPayloadSchemas = {
  'notify.send': NotifyPayload,
  'account.purge': AccountPurgePayload,
  'anon.run': AnonRunPayload,
  'embed.chunks': EmbedChunksPayload,
  'billing.reconcile': BillingReconcilePayload,
  'billing.monthly_grant': z.strictObject({}),
} as const satisfies Partial<Record<JobType, z.ZodType>>;
