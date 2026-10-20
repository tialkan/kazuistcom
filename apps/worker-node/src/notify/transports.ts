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
      await t.sendMail({
        from,
        to: m.to,
        replyTo,
        subject: m.subject,
        text: m.text,
        headers: m.listUnsubscribe ? { 'List-Unsubscribe': `<${m.listUnsubscribe}>` } : undefined,
      });
    },
  };
}

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export function vapidTransport(cfg: VapidConfig): WebPushTransport {
  return {
    async send(sub: WebPushSubscription, m: Message) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(m), {
          vapidDetails: cfg,
          TTL: 24 * 3600,
          urgency: 'normal',
        });
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

/** Token based APNs over HTTP/2. */
export function apnsTransport(cfg: ApnsConfig): ApnsTransport {
  let cached: { token: string; at: number } | undefined;
  const token = () => {
    const now = Math.floor(Date.now() / 1000);
    if (!cached || now - cached.at > 40 * 60) cached = { token: apnsJwt(cfg, now), at: now };
    return cached.token;
  };
  return {
    send(deviceToken, environment, m) {
      const host =
        environment === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
      return new Promise((resolve, reject) => {
        const client = connect(host);
        client.on('error', reject);
        const req = client.request({
          ':method': 'POST',
          ':path': `/3/device/${deviceToken}`,
          authorization: `bearer ${token()}`,
          'apns-topic': cfg.bundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
        });
        req.setEncoding('utf8');
        let status = 0;
        req.on('response', (h) => {
          status = Number(h[':status']);
        });
        req.on('data', () => undefined);
        req.on('end', () => {
          client.close();
          if (status === 200) resolve('ok');
          else if (status === 410 || status === 400) resolve('gone');
          else reject(new Error(`apns ${status}`));
        });
        req.end(
          JSON.stringify({
            aps: { alert: { title: m.title, body: m.body }, sound: 'default' },
            path: m.path,
          }),
        );
      });
    },
  };
}

export class MemoryEmail implements EmailTransport {
  readonly sent: EmailMessage[] = [];
  async send(m: EmailMessage) {
    this.sent.push(m);
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
