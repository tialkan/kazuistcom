import { notificationTypes } from '@kazuist/contracts';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import { dispatch, render } from '../dispatch.ts';
import { MemoryEmail, MemoryPush } from '../transports.ts';
import type { SqlClient } from '../../queue.ts';

/** hukuk-uyum madde 5: push and e-mail text carries no personal data, case summary or draft content. */
describe('notification content', () => {
  it('render() returns only i18n constants for every type', () => {
    for (const t of notificationTypes) {
      const m = render(t);
      expect(m.title).toBe(tr.bildirim[t].baslik);
      expect(m.body).toBe(tr.bildirim[t].metin);
      expect(m.path).toMatch(/^\/[a-z/]*$/);
    }
  });

  it('delivered push equals render() output whatever refId carries', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const db: SqlClient = {
      async query<R>(sql: string) {
        if (sql.startsWith('select email'))
          return { rows: [{ email: 'kisi@example.invalid', deleted_at: null }] as R[] };
        if (sql.includes('from push_subscriptions'))
          return {
            rows: [
              {
                id: 'a',
                channel: 'web_push',
                endpoint: 'https://push.example.invalid/x',
                keys: { p256dh: 'x', auth: 'y' },
                environment: null,
              },
              { id: 'b', channel: 'apns', endpoint: 'devtok', keys: null, environment: 'sandbox' },
            ] as R[],
          };
        return { rows: [] as R[] };
      },
    };
    const push = new MemoryPush();
    const email = new MemoryEmail();
    await dispatch(
      {
        db,
        email,
        webPush: push,
        apns: push,
        iys: { allowsEmail: async () => false },
        now: () => new Date('2026-10-20T09:00:00Z'),
        appUrl: 'https://kazuist.com',
      },
      { type: 'tam_metin_istegi', userId, refId: 'Ad Soyad 2024-123' },
    );
    expect(push.sent).toHaveLength(2);
    for (const s of push.sent) {
      expect(s.m).toEqual(render('tam_metin_istegi'));
      expect(JSON.stringify(s.m)).not.toMatch(/Ad Soyad|kisi@example/);
    }
    expect(email.sent[0]?.text).not.toContain('Ad Soyad');
  });
});
