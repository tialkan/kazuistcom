import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '../db.ts';
import { authHandler, eduStart, kvkkGuestPost, meGet } from '../handlers.ts';
import { unconfiguredMailer } from '../mailer.ts';
import { api, authReq, createHarness, signUp, type Harness } from './harness.ts';

/**
 * Plan 14.6 (wt.149d): every form that sends a code answers 503 with a Turkish message when no mail provider is
 * configured or the provider fails, instead of throwing or looking successful (Better Auth alone answers 200).
 */

let h: Harness;
const body = async (r: Response) => JSON.parse(await r.text());

beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});
afterEach(() => {
  h.mailer.configured = true;
  h.mailer.failing = false;
});

const guest = {
  kind: 'silme',
  detail: 'Karar metninde adim geciyor.',
  requesterName: 'Deneme Kisi',
  nationality: 'TR',
  identityNumber: '10000000146',
  address: 'Ornek Mahallesi 1. Sokak No 1 Ankara',
  contactEmail: 'misafir-posta@example.invalid',
  relation: 'karar_metninde_adi_gecen',
  replyChannel: 'eposta',
  declaration: true,
};

async function expect503(res: Response) {
  expect(res.status).toBe(503);
  const b = await body(res);
  expect(b).toMatchObject({ code: 'unavailable', message: tr.hata.epostaYok });
  expect(res.headers.get('cache-control')).toBe('no-store');
}

const codeForms = (email: string) => [
  authReq('/email-otp/send-verification-otp', { email, type: 'sign-in' }),
  authReq('/email-otp/send-verification-otp', { email, type: 'email-verification' }),
  authReq('/email-otp/request-password-reset', { email }),
  authReq('/forget-password/email-otp', { email }),
];

describe.each([
  ['no provider configured', () => (h.mailer.configured = false)],
  ['the provider fails', () => (h.mailer.failing = true)],
])('%s', (name, breakMail) => {
  const tag = name.startsWith('no') ? 'yok' : 'hata';

  it('sign in code, address verification and password reset answer 503', async () => {
    const email = `posta-${tag}@example.invalid`;
    await signUp(email);
    breakMail();
    for (const req of codeForms(email)) await expect503(await authHandler(req));
    expect(h.mailer.last(email)).toBeUndefined();
  });

  it('edu.tr verification answers 503', async () => {
    const { token } = await signUp(`edu-${tag}@example.invalid`);
    breakMail();
    await expect503(
      await eduStart(
        api('/v1/me/edu-verification', token, {
          method: 'POST',
          body: JSON.stringify({ email: `ogrenci-${tag}@ogr.ornek.edu.tr` }),
        }),
      ),
    );
  });

  it('KVKK application without an account answers 503', async () => {
    breakMail();
    const contactEmail = `misafir-${tag}@example.invalid`;
    await expect503(
      await kvkkGuestPost(
        api('/v1/kvkk-requests/guest', null, {
          method: 'POST',
          body: JSON.stringify({ ...guest, contactEmail }),
        }),
      ),
    );
  });
});

describe('without a provider nothing is half done', () => {
  it('no KVKK row and no edu code row is written before the 503', async () => {
    const { token } = await signUp('yarim@example.invalid');
    const id = (await body(await meGet(api('/v1/me', token)))).id as string;
    h.mailer.configured = false;
    const contactEmail = 'yarim-misafir@example.invalid';
    await kvkkGuestPost(
      api('/v1/kvkk-requests/guest', null, {
        method: 'POST',
        body: JSON.stringify({ ...guest, contactEmail }),
      }),
    );
    expect(
      await h.db.select().from(schema.kvkkRequests).where(eq(schema.kvkkRequests.contactEmail, contactEmail)),
    ).toHaveLength(0);
    await eduStart(
      api('/v1/me/edu-verification', token, {
        method: 'POST',
        body: JSON.stringify({ email: 'yarim@ogr.ornek.edu.tr' }),
      }),
    );
    expect(
      await h.db.select().from(schema.eduVerifications).where(eq(schema.eduVerifications.userId, id)),
    ).toHaveLength(0);
  });

  it('the answer does not depend on whether the address has an account', async () => {
    h.mailer.configured = false;
    await expect503(
      await authHandler(authReq('/email-otp/request-password-reset', { email: 'yok-boyle@example.invalid' })),
    );
  });

  it('sign up and password sign in send no code and keep working', async () => {
    h.mailer.configured = false;
    const { token } = await signUp('kayit-postasiz@example.invalid');
    expect((await meGet(api('/v1/me', token))).status).toBe(200);
  });

  it('the production fallback mailer reports itself unconfigured', async () => {
    expect(unconfiguredMailer.configured).toBe(false);
    await expect(unconfiguredMailer.sendCode('a@example.invalid', 'sign-in', '123456')).rejects.toThrow(
      'mail provider not configured',
    );
  });

  it('works again once a provider is back', async () => {
    const email = 'geri-geldi@example.invalid';
    await signUp(email);
    const res = await authHandler(authReq('/email-otp/send-verification-otp', { email, type: 'sign-in' }));
    expect(res.status).toBe(200);
    expect(h.mailer.last(email, 'sign-in')?.code).toMatch(/^\d{6}$/);
  });
});
