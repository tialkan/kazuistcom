import {
  NotifyPayload,
  notificationChannels,
  notificationTypes,
  type NotificationChannel,
  type NotificationType,
} from '@kazuist/contracts';

/** Vocabulary comes from contracts (jobs.ts, ADR-0023); this module keeps the delivery rules. */
export { NotifyPayload, notificationTypes };
export type { NotificationType };
export const channels = notificationChannels;
export type Channel = NotificationChannel;

export const commercialTypes: readonly NotificationType[] = ['kampanya'];
/** Information the user must receive by e-mail (payment and cancellation); cannot be turned off. */
export const mandatoryEmailTypes: readonly NotificationType[] = ['odeme', 'fesih_teyidi'];
/** Delivered even in quiet hours because they confirm something the user just did. */
export const quietHourExempt: readonly NotificationType[] = ['odeme', 'fesih_teyidi'];

export const isCommercial = (t: NotificationType) => commercialTypes.includes(t);

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
