import { z } from 'zod';

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
export type NotificationType = (typeof notificationTypes)[number];

export const channels = ['email', 'web_push', 'apns'] as const;
export type Channel = (typeof channels)[number];

export const commercialTypes: readonly NotificationType[] = ['kampanya'];
/** Information the user must receive by e-mail (payment and cancellation); cannot be turned off. */
export const mandatoryEmailTypes: readonly NotificationType[] = ['odeme', 'fesih_teyidi'];
/** Delivered even in quiet hours because they confirm something the user just did. */
export const quietHourExempt: readonly NotificationType[] = ['odeme', 'fesih_teyidi'];

export const isCommercial = (t: NotificationType) => commercialTypes.includes(t);

/**
 * notify.send job payload. Ids only, never personal data (Ek C.3). Temporary local schema until
 * contracts carries it (docs/istekler/kimlik-bildirim-is-yuku.md).
 */
export const NotifyPayload = z.strictObject({
  type: z.enum(notificationTypes),
  userId: z.uuid(),
  refId: z.string().max(100).optional(),
  /** Restrict to some channels; default all the user allows. */
  channels: z.array(z.enum(channels)).optional(),
});
export type NotifyPayload = z.infer<typeof NotifyPayload>;

export interface Message {
  title: string;
  body: string;
  /** Path in the app that the notification opens. */
  path: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Commercial messages carry an opt out header and footer. */
  listUnsubscribe?: string;
}

export interface EmailTransport {
  send(m: EmailMessage): Promise<void>;
}

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface WebPushTransport {
  /** Returns 'gone' when the subscription expired (404/410) so it can be removed. */
  send(sub: WebPushSubscription, m: Message): Promise<'ok' | 'gone'>;
}

export interface ApnsTransport {
  send(deviceToken: string, environment: 'production' | 'sandbox', m: Message): Promise<'ok' | 'gone'>;
}
