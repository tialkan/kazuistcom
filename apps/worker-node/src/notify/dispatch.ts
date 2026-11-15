import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { deliveredTargetsSql, enqueueJob, recordDeliverySql, type ClaimedJob } from '@kazuist/db/jobs';
import { logError } from '@kazuist/log';
import type { SqlClient } from '../queue.ts';
import { renderBillingNotice } from '../billing/notice-text.ts';
import { renderKalemcikNotice } from '../kalemcik/bildirim.ts';
import { deliverLegalDocuments } from './legal-delivery.ts';
import { channelAllows, commercialAllowed, type Prefs } from './prefs.ts';
import { isQuietHour, nextSendTime } from './quiet-hours.ts';
import { targetHash, targetKeyFromEnv } from './target-hash.ts';
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
  /**
   * HMAC key for push target hashes in notification_deliveries (notifyTargetKey). Default: derived from
   * BETTER_AUTH_SECRET. Without a key push targets are sent best effort and not recorded.
   */
  targetKey?: Uint8Array;
}

/** The claimed job a dispatch runs for; its id keys the delivery record (ADR-0035). */
export type NotifyJob = Pick<ClaimedJob, 'id' | 'attempts' | 'max_attempts'>;

export interface DispatchResult {
  status: 'sent' | 'deferred' | 'skipped';
  reason?: string;
  sent: Channel[];
  runAfter?: string;
}

/** A push target failed while others were delivered; the retry sends only what is not recorded yet. */
export class PushDeliveryError extends Error {
  override name = 'PushDeliveryError';
}

const paths: Record<NotificationType, string> = {
  teslim_hatirlatmasi: '/yazma',
  kalemcik: '/kalemcik',
  // Kampus is passive (ADR-0031); these types are not produced, the link lands on the account page.
  tam_metin_istegi: '/hesap',
  tam_metin_cevabi: '/hesap',
  takip: '/hesap',
  // There is no wallet page; billing notices land on the account hub (link check 2026-11-15).
  odeme: '/hesap',
  fesih_teyidi: '/hesap',
  mevzuat_degisikligi: '/hesap',
  kampanya: '/',
};

export function render(type: NotificationType, refId?: string): Message {
  if (refId && (type === 'odeme' || type === 'fesih_teyidi')) {
    const billing = renderBillingNotice(refId);
    if (billing !== null) return billing;
  }
  // Kalemcik reminders name their message in refId (docs/istekler/yazma-bildirim-ve-hesap.md).
  if (refId && (type === 'teslim_hatirlatmasi' || type === 'kalemcik')) {
    const kalemcik = renderKalemcikNotice(refId);
    if (kalemcik !== null) return kalemcik;
  }
  const t = tr.bildirim[type];
  return { title: t.baslik, body: t.metin, path: paths[type] };
}

const asPrefs = (row: { email: unknown; web_push: unknown; apns: unknown } | undefined): Prefs => ({
  email: (row?.email ?? {}) as Prefs['email'],
  web_push: (row?.web_push ?? {}) as Prefs['web_push'],
  apns: (row?.apns ?? {}) as Prefs['apns'],
});

/** Target hash of e-mail in notification_deliveries (one address per user). */
const EMAIL_TARGET = 'email';
const deliveryKey = (channel: Channel, hash: string) => `${channel}:${hash}`;

/** Dedupe key of the job that a quiet hour deferral creates, so a retried deferral queues it once. */
export const deferKey = (jobId: string) => `notify.send:defer:${jobId}`;

/**
 * Deliver one notify.send job: preferences, commercial gate, quiet hours, channels.
 *
 * With a job (the queue handler always passes one) every delivery is recorded in notification_deliveries right
 * after it succeeded and skipped on a retry of the same job: e-mail as target 'email', a push target as the HMAC
 * of its endpoint or device token. A failing push target then fails the job so the retry sends only the missing
 * targets; on the last attempt the job completes as push_partial. Without a job (direct calls) nothing is
 * recorded and a push failure after a delivery completes as push_partial.
 */
export async function dispatch(
  deps: NotifyDeps,
  rawPayload: unknown,
  job?: NotifyJob,
): Promise<DispatchResult> {
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
    // Contract PDFs keep their own delivery record (order_legal_document_deliveries).
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

  // Targets an earlier attempt of this job already delivered. Lock ownership (ADR-0035) runs attempts one at a
  // time, so one read per attempt is enough.
  const delivered = new Set<string>();
  if (job) {
    const { rows } = await deps.db.query<{ channel: Channel; target_hash: string }>(deliveredTargetsSql, [
      job.id,
    ]);
    for (const r of rows) delivered.add(deliveryKey(r.channel, r.target_hash));
  }

  // A retry that already delivered something finishes now: a deferred job would start a new delivery record.
  if (isQuietHour(now) && !quietHourExempt.includes(payload.type) && delivered.size === 0) {
    const runAfter = nextSendTime(now);
    await enqueueJob(
      deps.db,
      'notify.send',
      payload,
      job ? { once: true, dedupeKey: deferKey(job.id), runAfter } : { runAfter },
    );
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
  const markSent = (c: Channel) => {
    if (!sent.includes(c)) sent.push(c);
  };
  const record = async (c: Channel, hash: string) => {
    if (job) await deps.db.query(recordDeliverySql, [job.id, c, hash]);
  };

  if (deps.email && wanted('email')) {
    if (delivered.has(deliveryKey('email', EMAIL_TARGET))) {
      markSent('email');
    } else {
      const commercial = isCommercial(payload.type);
      const footer = commercial ? tr.bildirim.ret : tr.bildirim.altBilgi;
      await deps.email.send({
        to: user.email,
        subject: m.title,
        text: `${m.body}\n\n${deps.appUrl}${m.path}\n\n${footer}`,
        listUnsubscribe: commercial ? `${deps.appUrl}/hesap/bildirimler` : undefined,
      });
      await record('email', EMAIL_TARGET);
      markSent('email');
    }
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
  const key = deps.targetKey ?? targetKeyFromEnv();
  // Push targets are recorded only with a job and a key; otherwise a retry could repeat them.
  const tracked = job !== undefined && key !== undefined;
  /*
   * A failing subscription is logged (error class only) and the next one is tried. Recorded targets are never
   * sent twice, so a tracked failure fails the job and the retry delivers only the missing targets.
   */
  let pushFailures = 0;
  const { webPush, apns } = deps;
  for (const s of subs) {
    let send: (() => Promise<'ok' | 'gone'>) | undefined;
    let channel: Channel | undefined;
    if (s.channel === 'web_push' && webPush && wanted('web_push')) {
      channel = 'web_push';
      send = () =>
        webPush.send({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, pushMessage);
    } else if (s.channel === 'apns' && apns && wanted('apns')) {
      channel = 'apns';
      send = () =>
        apns.send(s.endpoint, s.environment === 'production' ? 'production' : 'sandbox', pushMessage);
    }
    if (!channel || !send) continue;
    const hash = tracked ? targetHash(key, s.endpoint) : undefined;
    if (hash && delivered.has(deliveryKey(channel, hash))) {
      markSent(channel);
      continue;
    }
    try {
      const r = await send();
      if (r === 'ok') {
        if (hash) await record(channel, hash);
        markSent(channel);
      } else {
        await deps.db.query('delete from push_subscriptions where id = $1', [s.id]);
      }
    } catch (err) {
      pushFailures++;
      logError('notify', err, { channel: s.channel, type: payload.type });
    }
  }
  if (pushFailures && !sent.length) throw new PushDeliveryError('notify: every push delivery failed');
  if (pushFailures && tracked && job.attempts < job.max_attempts)
    throw new PushDeliveryError('notify: some push deliveries failed, retrying the missing targets');
  return sent.length
    ? { status: 'sent', sent, ...(pushFailures ? { reason: 'push_partial' } : {}) }
    : { status: 'skipped', reason: 'no_channel', sent };
}

/** JobHandler for the consumer in queue.ts: `{ 'notify.send': createNotifyHandler(deps) }`. */
export function createNotifyHandler(deps: NotifyDeps) {
  return (job: ClaimedJob) => dispatch(deps, job.payload, job);
}
