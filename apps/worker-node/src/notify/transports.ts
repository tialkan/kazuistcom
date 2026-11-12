import { createPrivateKey, sign } from 'node:crypto';
import { connect } from 'node:http2';
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import type {
  ApnsTransport,
  EmailMessage,
  EmailTransport,
  Message,
  WebPushSubscription,
  WebPushTransport,
} from './types.ts';

/**
 * E-mail provider is abstract (plan 14.6: provider operated in Turkey, chosen by Tarik). SMTP
 * covers development (Mailpit, smtp://localhost:1025) and most providers.
 */
export function smtpTransport(
  url: string,
  from = '"Kazuist" <bildirim@kazuist.com>',
  replyTo?: string,
): EmailTransport {
  const t = nodemailer.createTransport(url);
  return {
    async send(m: EmailMessage) {
      const result = await t.sendMail({
        from,
        to: m.to,
        replyTo,
        subject: m.subject,
        text: m.text,
        messageId: m.messageId,
        attachments: m.attachments?.map((attachment) => ({
          ...attachment,
          content: Buffer.from(attachment.content),
        })),
        headers: m.listUnsubscribe ? { 'List-Unsubscribe': `<${m.listUnsubscribe}>` } : undefined,
      });
      if (!result.messageId || result.rejected.length || !result.accepted.length)
        throw new Error('Email provider did not accept the recipient');
      return { messageId: result.messageId };
    },
  };
}

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/** Upper bound of one push request; a hanging provider must not hold the worker (billing jobs share it). */
export const PUSH_TIMEOUT_MS = 10_000;

/** Rejects when `p` has not settled within `ms`; `onTimeout` releases the underlying resource. */
export function withDeadline<T>(
  p: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      const err = new Error(`${label} timed out after ${ms} ms`);
      err.name = 'PushTimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

type SendNotification = typeof webpush.sendNotification;

export function vapidTransport(
  cfg: VapidConfig,
  sendNotification: SendNotification = webpush.sendNotification.bind(webpush),
  timeoutMs = PUSH_TIMEOUT_MS,
): WebPushTransport {
  return {
    async send(sub: WebPushSubscription, m: Message) {
      try {
        // `timeout` is the socket timeout of web-push; the deadline also bounds a slow trickle.
        await withDeadline(
          sendNotification(sub, JSON.stringify(m), {
            vapidDetails: cfg,
            TTL: 24 * 3600,
            urgency: 'normal',
            timeout: timeoutMs,
          }),
          timeoutMs,
          'web-push',
        );
        return 'ok';
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) return 'gone';
        throw err;
      }
    },
  };
}

export interface ApnsConfig {
  /** Contents of the .p8 key (PEM). */
  keyPem: string;
  keyId: string;
  teamId: string;
  bundleId: string;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Provider token (ES256 JWT), valid up to an hour; APNs rejects refreshes more often than 20 minutes. */
export function apnsJwt(cfg: ApnsConfig, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSec }));
  const sig = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(cfg.keyPem),
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${claims}.${b64url(sig)}`;
}

/**
 * Outcome of an APNs response. Only 410 (token no longer active) or a body reason of BadDeviceToken or
 * Unregistered removes the device; any other 400 (BadTopic, PayloadTooLarge and so on) is our error and
 * must not delete every registration (Apple: Handling notification responses from APNs).
 */
export function apnsOutcome(status: number, body: string): 'ok' | 'gone' | 'error' {
  if (status === 200) return 'ok';
  if (status === 410) return 'gone';
  let reason: unknown;
  try {
    reason = (JSON.parse(body) as { reason?: unknown }).reason;
  } catch {
    reason = undefined;
  }
  return reason === 'BadDeviceToken' || reason === 'Unregistered' ? 'gone' : 'error';
}

export interface ApnsOptions {
  timeoutMs?: number;
  /** Tests point this at a local HTTP/2 server; production uses Apple's hosts. */
  origin?: (environment: 'production' | 'sandbox') => string;
}

const appleOrigin = (environment: 'production' | 'sandbox') =>
  environment === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';

/** Token based APNs over HTTP/2, one connection per send, closed on every path. */
export function apnsTransport(cfg: ApnsConfig, opts: ApnsOptions = {}): ApnsTransport {
  const timeoutMs = opts.timeoutMs ?? PUSH_TIMEOUT_MS;
  const origin = opts.origin ?? appleOrigin;
  let cached: { token: string; at: number } | undefined;
  const token = () => {
    const now = Math.floor(Date.now() / 1000);
    if (!cached || now - cached.at > 40 * 60) cached = { token: apnsJwt(cfg, now), at: now };
    return cached.token;
  };
  return {
    send(deviceToken, environment, m) {
      const client = connect(origin(environment));
      const result = new Promise<'ok' | 'gone'>((resolve, reject) => {
        client.on('error', reject);
        const req = client.request({
          ':method': 'POST',
          ':path': `/3/device/${encodeURIComponent(deviceToken)}`,
          authorization: `bearer ${token()}`,
          'apns-topic': cfg.bundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
        });
        req.setEncoding('utf8');
        let status = 0;
        let body = '';
        req.on('response', (h) => {
          status = Number(h[':status']);
        });
        req.on('data', (chunk: string) => {
          if (body.length < 4096) body += chunk;
        });
        req.on('error', reject);
        req.on('end', () => {
          const outcome = apnsOutcome(status, body);
          if (outcome === 'error') {
            const err = new Error(`apns ${status}`);
            err.name = 'ApnsError';
            reject(err);
          } else resolve(outcome);
        });
        req.end(
          JSON.stringify({
            aps: { alert: { title: m.title, body: m.body }, sound: 'default' },
            path: m.path,
          }),
        );
      });
      return withDeadline(result, timeoutMs, 'apns', () => client.destroy()).finally(() => {
        if (!client.closed && !client.destroyed) client.close();
      });
    },
  };
}

export class MemoryEmail implements EmailTransport {
  readonly sent: EmailMessage[] = [];
  async send(m: EmailMessage) {
    this.sent.push(m);
    return undefined;
  }
}

export class MemoryPush implements WebPushTransport, ApnsTransport {
  readonly sent: { target: string; m: Message }[] = [];
  gone = new Set<string>();
  async send(a: WebPushSubscription | string, b: Message | string, c?: Message) {
    const target = typeof a === 'string' ? a : a.endpoint;
    const m = (typeof b === 'string' ? c : b) as Message;
    if (this.gone.has(target)) return 'gone' as const;
    this.sent.push({ target, m });
    return 'ok' as const;
  }
}
