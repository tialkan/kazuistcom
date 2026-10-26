import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import type { ClaimedJob } from '@kazuist/db/jobs';
import type { SqlClient } from '../queue.ts';
import { renderBillingNotice } from '../billing/notice-text.ts';
import { deliverLegalDocuments } from './legal-delivery.ts';
import { channelAllows, commercialAllowed, type Prefs } from './prefs.ts';
import { isQuietHour, nextSendTime } from './quiet-hours.ts';
import {
  isCommercial,
  NotifyPayload,
  quietHourExempt,
  type ApnsTransport,
  type Channel,
  type EmailTransport,
  type Message,
  type NotificationType,
  type WebPushTransport,
} from './types.ts';

export interface IysChecker {
  /** True when the address is recorded in IYS as allowing commercial e-mail. */
  allowsEmail(email: string): Promise<boolean>;
}

/** Until the IYS integration exists nothing commercial is sent (fail closed). */
export const iysUnavailable: IysChecker = { allowsEmail: async () => false };

export interface NotifyDeps {
  db: SqlClient;
  email?: EmailTransport;
  webPush?: WebPushTransport;
  apns?: ApnsTransport;
  iys: IysChecker;
  now?: () => Date;
  appUrl: string;
  /** Tests can inject the same licensed font without a runtime asset path. */
  legalPdfFontBytes?: Uint8Array;
}

export interface DispatchResult {
  status: 'sent' | 'deferred' | 'skipped';
  reason?: string;
  sent: Channel[];
  runAfter?: string;
}

const paths: Record<NotificationType, string> = {
  teslim_hatirlatmasi: '/yazma',
  kalemcik: '/kalemcik',
  tam_metin_istegi: '/kampus',
  tam_metin_cevabi: '/kampus',
  takip: '/hesap',
  odeme: '/hesap/cuzdan',
  fesih_teyidi: '/hesap/cuzdan',
  mevzuat_degisikligi: '/hesap',
  kampanya: '/',
};

export function render(type: NotificationType, refId?: string): Message {
  if (refId && (type === 'odeme' || type === 'fesih_teyidi')) {
    const billing = renderBillingNotice(refId);
    if (billing !== null) return billing;
  }
  const t = tr.bildirim[type];
  return { title: t.baslik, body: t.metin, path: paths[type] };
}

const asPrefs = (row: { email: unknown; web_push: unknown; apns: unknown } | undefined): Prefs => ({
  email: (row?.email ?? {}) as Prefs['email'],
  web_push: (row?.web_push ?? {}) as Prefs['web_push'],
  apns: (row?.apns ?? {}) as Prefs['apns'],
});

/** Deliver one notify.send job: preferences, commercial gate, quiet hours, channels. */
export async function dispatch(deps: NotifyDeps, rawPayload: unknown): Promise<DispatchResult> {
  const payload = NotifyPayload.parse(rawPayload);
  const now = deps.now?.() ?? new Date();
  // A contract cannot complete by falling back to a generic notification or a push transport.
  if (
    payload.type === 'odeme' &&
    (payload.subtype === 'sozlesme' || payload.refId?.startsWith('sozlesme:'))
  ) {
    if (!payload.refId?.startsWith('sozlesme:')) throw new Error('Contract order reference is missing');
    const orderId = payload.refId.slice('sozlesme:'.length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId))
      throw new Error('Invalid contract order reference');
    const result = await deliverLegalDocuments({
      db: deps.db,
      orderId,
      userId: payload.userId,
      email: deps.email,
      now,
      fontBytes: deps.legalPdfFontBytes,
    });
    return result === 'sent'
      ? { status: 'sent', sent: ['email'] }
      : { status: 'skipped', reason: 'already_delivered', sent: [] };
  }

  const { rows: users } = await deps.db.query<{ email: string; deleted_at: Date | null }>(
    'select email, deleted_at from users where id = $1',
    [payload.userId],
  );
  const user = users[0];
  if (!user || user.deleted_at) return { status: 'skipped', reason: 'no_user', sent: [] };

  if (isCommercial(payload.type)) {
    const { rows } = await deps.db.query<{ granted: boolean }>(
      `select granted from consents where user_id = $1 and kind = 'acik_riza_pazarlama'
       order by created_at desc limit 1`,
      [payload.userId],
    );
    const gate = {
      consentGranted: rows[0]?.granted === true,
      iysAllowed: await deps.iys.allowsEmail(user.email),
    };
    if (!commercialAllowed(gate)) return { status: 'skipped', reason: 'commercial_not_allowed', sent: [] };
  }

  if (isQuietHour(now) && !quietHourExempt.includes(payload.type)) {
    const runAfter = nextSendTime(now);
    await deps.db.query(`insert into jobs (type, payload, run_after) values ('notify.send', $1::jsonb, $2)`, [
      JSON.stringify(payload),
      runAfter.toISOString(),
    ]);
    return { status: 'deferred', reason: 'quiet_hours', sent: [], runAfter: runAfter.toISOString() };
  }

  const { rows: prefRows } = await deps.db.query<{ email: unknown; web_push: unknown; apns: unknown }>(
    'select email, web_push, apns from notification_prefs where user_id = $1',
    [payload.userId],
  );
  const prefs = asPrefs(prefRows[0]);
  const wanted = (c: Channel) =>
    (!payload.channels || payload.channels.includes(c)) && channelAllows(prefs, c, payload.type);
  const m = render(payload.type, payload.refId);
  // External push providers receive only generic text, never billing details (plan 5.5).
  const pushMessage = render(payload.type);
  const sent: Channel[] = [];

  if (deps.email && wanted('email')) {
    const commercial = isCommercial(payload.type);
    const footer = commercial ? tr.bildirim.ret : tr.bildirim.altBilgi;
    await deps.email.send({
      to: user.email,
      subject: m.title,
      text: `${m.body}\n\n${deps.appUrl}${m.path}\n\n${footer}`,
      listUnsubscribe: commercial ? `${deps.appUrl}/hesap/bildirimler` : undefined,
    });
    sent.push('email');
  }

  const { rows: subs } = await deps.db.query<{
    id: string;
    channel: string;
    endpoint: string;
    keys: unknown;
    environment: string | null;
  }>('select id, channel, endpoint, keys, environment from push_subscriptions where user_id = $1', [
    payload.userId,
  ]);
  for (const s of subs) {
    let r: 'ok' | 'gone' | undefined;
    if (s.channel === 'web_push' && deps.webPush && wanted('web_push')) {
      r = await deps.webPush.send(
        { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
        pushMessage,
      );
      if (r === 'ok' && !sent.includes('web_push')) sent.push('web_push');
    } else if (s.channel === 'apns' && deps.apns && wanted('apns')) {
      r = await deps.apns.send(
        s.endpoint,
        s.environment === 'production' ? 'production' : 'sandbox',
        pushMessage,
      );
      if (r === 'ok' && !sent.includes('apns')) sent.push('apns');
    }
    if (r === 'gone') await deps.db.query('delete from push_subscriptions where id = $1', [s.id]);
  }
  return sent.length ? { status: 'sent', sent } : { status: 'skipped', reason: 'no_channel', sent };
}

/** JobHandler for the consumer in queue.ts: `{ 'notify.send': createNotifyHandler(deps) }`. */
export function createNotifyHandler(deps: NotifyDeps) {
  return (job: ClaimedJob) => dispatch(deps, job.payload);
}
