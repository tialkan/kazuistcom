import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Http2Server, type ServerHttp2Stream } from 'node:http2';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SqlClient } from '../../queue.ts';
import { refIdOlustur, renderKalemcikNotice } from '../../kalemcik/bildirim.ts';
import { dispatch, render, type NotifyDeps } from '../dispatch.ts';
import {
  apnsOutcome,
  apnsTransport,
  MemoryEmail,
  MemoryPush,
  PUSH_TIMEOUT_MS,
  vapidTransport,
} from '../transports.ts';
import type { ApnsTransport, Message, WebPushTransport } from '../types.ts';

/** P7 madde 5: Kalemcik text, APNs outcome rules, push timeouts and no repeated e-mail on push failure. */

const msg: Message = { title: 'Başlık', body: 'Metin', path: '/hesap' };

describe('render()', () => {
  it('uses the Kalemcik text for teslim_hatirlatmasi and kalemcik references', () => {
    const ref = refIdOlustur({
      tur: 'teslim7',
      hitap: 'siz',
      varyant: 0,
      kalan: 7,
      gunluk: 500,
      gun: 7,
      sessiz: 0,
    });
    const k = renderKalemcikNotice(ref);
    expect(k).not.toBeNull();
    expect(render('teslim_hatirlatmasi', ref)).toEqual(k);
    expect(render('kalemcik', ref)).toEqual(k);
  });

  it('falls back to the generic text for other types and unknown references', () => {
    expect(render('kalemcik', 'kalemcik:yok')).toEqual(render('kalemcik'));
    expect(render('takip', 'kalemcik:sessizlik:sen:0:1:1:1:1')).toEqual(render('takip'));
  });

  it('sends full text requests to /hesap, never to the passive /kampus', () => {
    expect(render('tam_metin_istegi').path).toBe('/hesap');
    expect(render('tam_metin_cevabi').path).toBe('/hesap');
  });
});

describe('apnsOutcome', () => {
  it.each([
    [200, '', 'ok'],
    [410, '{"reason":"Unregistered"}', 'gone'],
    [410, '', 'gone'],
    [400, '{"reason":"BadDeviceToken"}', 'gone'],
    [400, '{"reason":"Unregistered"}', 'gone'],
    [400, '{"reason":"BadTopic"}', 'error'],
    [400, '{"reason":"PayloadTooLarge"}', 'error'],
    [400, 'not json', 'error'],
    [403, '{"reason":"InvalidProviderToken"}', 'error'],
    [500, '', 'error'],
  ] as const)('%i %s -> %s', (status, body, want) => {
    expect(apnsOutcome(status, body)).toBe(want);
  });
});

describe('APNs transport over HTTP/2', () => {
  let server: Http2Server | undefined;
  afterEach(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
    server = undefined;
  });
  const keyPem = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const cfg = { keyPem, keyId: 'KEY123', teamId: 'TEAM123', bundleId: 'com.kazuist.app' };

  async function serve(handler: (stream: ServerHttp2Stream) => void) {
    const sessions: { closed: boolean }[] = [];
    server = createServer();
    server.on('session', (s) => sessions.push(s));
    server.on('stream', (stream: ServerHttp2Stream) => {
      stream.on('data', () => undefined);
      handler(stream);
    });
    await new Promise<void>((r) => server?.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;
    return { origin: () => `http://127.0.0.1:${port}`, sessions };
  }

  const answer =
    (status: number, body = '') =>
    (stream: ServerHttp2Stream) => {
      stream.respond({ ':status': status });
      stream.end(body);
    };

  it('200 is ok, BadDeviceToken is gone, another 400 is an error', async () => {
    const replies = [
      answer(200),
      answer(400, '{"reason":"BadDeviceToken"}'),
      answer(400, '{"reason":"BadTopic"}'),
    ];
    let i = 0;
    const { origin } = await serve((stream) => replies[i++]?.(stream));
    const t = apnsTransport(cfg, { origin });
    expect(await t.send('tok1', 'sandbox', msg)).toBe('ok');
    expect(await t.send('tok2', 'sandbox', msg)).toBe('gone');
    await expect(t.send('tok3', 'sandbox', msg)).rejects.toThrow(/apns 400/);
  });

  it('a hanging APNs request times out and the connection is closed', async () => {
    const { origin, sessions } = await serve(() => undefined);
    const t = apnsTransport(cfg, { origin, timeoutMs: 150 });
    const started = Date.now();
    await expect(t.send('tok', 'sandbox', msg)).rejects.toMatchObject({ name: 'PushTimeoutError' });
    expect(Date.now() - started).toBeLessThan(2_000);
    await vi.waitFor(() => expect(sessions.every((s) => s.closed)).toBe(true));
  });
});

describe('web-push transport', () => {
  const vapid = { subject: 'mailto:test@example.invalid', publicKey: 'p', privateKey: 'k' };
  const sub = { endpoint: 'https://push.example.invalid/1', keys: { p256dh: 'x', auth: 'y' } };

  it('passes a 10 second socket timeout and maps 404 and 410 to gone', async () => {
    const calls: unknown[] = [];
    const ok = vapidTransport(vapid, (async (...args: unknown[]) => {
      calls.push(args[2]);
      return { statusCode: 201, body: '', headers: {} };
    }) as never);
    expect(await ok.send(sub, msg)).toBe('ok');
    expect(calls[0]).toMatchObject({ timeout: PUSH_TIMEOUT_MS });
    expect(PUSH_TIMEOUT_MS).toBe(10_000);
    const gone = vapidTransport(vapid, (async () => {
      throw Object.assign(new Error('gone'), { statusCode: 410 });
    }) as never);
    expect(await gone.send(sub, msg)).toBe('gone');
  });

  it('a provider that never answers is cut by the deadline', async () => {
    const hang = vapidTransport(vapid, (() => new Promise(() => undefined)) as never, 100);
    await expect(hang.send(sub, msg)).rejects.toMatchObject({ name: 'PushTimeoutError' });
  });
});

describe('dispatch: a push failure after the e-mail', () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const db = (subs: { id: string; channel: string; endpoint: string }[]): SqlClient => ({
    async query<R>(sql: string) {
      if (sql.startsWith('select email'))
        return { rows: [{ email: 'kisi@example.invalid', deleted_at: null }] as R[] };
      if (sql.includes('from push_subscriptions'))
        return {
          rows: subs.map((s) => ({
            ...s,
            keys: s.channel === 'web_push' ? { p256dh: 'x', auth: 'y' } : null,
            environment: s.channel === 'apns' ? 'sandbox' : null,
          })) as R[],
        };
      return { rows: [] as R[] };
    },
  });
  const failing: WebPushTransport & ApnsTransport = {
    send: async () => {
      throw new Error('provider down');
    },
  };
  const deps = (over: Partial<NotifyDeps>): NotifyDeps => ({
    db: db([]),
    iys: { allowsEmail: async () => false },
    now: () => new Date('2026-10-20T09:00:00Z'),
    appUrl: 'https://kazuist.com',
    ...over,
  });

  it('completes with the e-mail sent once and logs only the error class', async () => {
    const email = new MemoryEmail();
    const push = new MemoryPush();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const apnsOk: ApnsTransport = { send: (a, b, c) => push.send(a, b, c) };
    const r = await dispatch(
      deps({
        db: db([
          { id: 'w', channel: 'web_push', endpoint: 'https://push.example.invalid/w' },
          { id: 'a', channel: 'apns', endpoint: 'devtok' },
        ]),
        email,
        webPush: failing,
        apns: apnsOk,
      }),
      { type: 'takip', userId },
    );
    expect(r).toMatchObject({ status: 'sent', reason: 'push_partial' });
    expect(r.sent.sort()).toEqual(['apns', 'email']);
    expect(email.sent).toHaveLength(1);
    expect(push.sent.map((s) => s.target)).toEqual(['devtok']);
    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      at: 'notify',
      level: 'error',
      channel: 'web_push',
      type: 'takip',
      error: 'Error',
    });
    expect(line).not.toMatch(/kisi@|provider down|push\.example/);
    log.mockRestore();
  });

  it('fails the job (retry) only when nothing at all was delivered', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      dispatch(
        deps({
          db: db([{ id: 'w', channel: 'web_push', endpoint: 'https://push.example.invalid/w' }]),
          webPush: failing,
        }),
        { type: 'takip', userId, channels: ['web_push'] },
      ),
    ).rejects.toThrow(/every push delivery failed/);
    log.mockRestore();
  });
});
