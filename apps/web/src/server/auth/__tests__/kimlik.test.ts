import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '@kazuist/contracts';
import { z } from 'zod';

const KvkkReceipt = z.object({
  id: z.uuid(),
  status: z.string(),
  receivedAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
});
import { schema } from '../db.ts';
import { expireEduVerifications, isEduTrEmail } from '../edu.ts';
import {
  authHandler,
  consentsGet,
  consentsPost,
  eduConfirm,
  eduStart,
  kvkkPost,
  meDelete,
  meExport,
  meGet,
  mePatch,
  professionsGet,
  targetProfessionPut,
} from '../handlers.ts';
import { eq } from 'drizzle-orm';
import { api, authReq, BASE, createHarness, signUp, type Harness } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

const body = async (r: Response) => JSON.parse(await r.text());

describe('sign up and sessions (Better Auth on the existing schema)', () => {
  it('signs up with e-mail and password, gives kullanici role and a bearer token', async () => {
    const { token, res } = await signUp('ayse@example.invalid');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/kazuist\.session_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const me = await body(await meGet(api('/v1/me', token)));
    expect(me).toMatchObject({
      email: 'ayse@example.invalid',
      roles: ['kullanici'],
      eduVerified: false,
      plan: 'ucretsiz',
    });
    const [audit] = await h.db.select().from(schema.auditLog).where(eq(schema.auditLog.subjectId, me.id));
    expect(audit?.action).toBe('user.created');
  });

  it('accepts the session cookie as well as the bearer token', async () => {
    const res = await authHandler(
      authReq('/sign-in/email', { email: 'ayse@example.invalid', password: 'parola-cok-gizli-1' }),
    );
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const me = await meGet(new Request(`${BASE}/api/v1/me`, { headers: { cookie } }));
    expect(me.status).toBe(200);
  });

  it('signs in with a 6 digit e-mail code', async () => {
    await signUp('kod@example.invalid');
    const send = await authHandler(
      authReq('/email-otp/send-verification-otp', { email: 'kod@example.invalid', type: 'sign-in' }),
    );
    expect(send.status).toBe(200);
    const mail = h.mailer.last('kod@example.invalid', 'sign-in');
    expect(mail?.code).toMatch(/^[0-9]{6}$/);
    const res = await authHandler(
      authReq('/sign-in/email-otp', { email: 'kod@example.invalid', otp: mail?.code }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-auth-token')).toBeTruthy();
  });

  it('rejects a wrong password and unknown callers', async () => {
    const res = await authHandler(
      authReq('/sign-in/email', { email: 'ayse@example.invalid', password: 'yanlis-parola-00' }),
    );
    expect(res.status).toBe(401);
    expect((await meGet(api('/v1/me', null))).status).toBe(401);
    expect((await meGet(api('/v1/me', 'not-a-token'))).status).toBe(401);
  });
});

describe('/v1/me', () => {
  it('PATCH updates profile fields and rejects unknown fields', async () => {
    const { token } = await signUp('patch@example.invalid');
    const ok = await mePatch(
      api('/v1/me', token, { method: 'PATCH', body: JSON.stringify({ name: 'Yeni Ad', tone: 'dogrudan' }) }),
    );
    expect(ok.status).toBe(200);
    expect(await body(ok)).toMatchObject({ name: 'Yeni Ad', tone: 'dogrudan' });
    const bad = await mePatch(
      api('/v1/me', token, { method: 'PATCH', body: JSON.stringify({ email: 'x@example.invalid' }) }),
    );
    expect(bad.status).toBe(400);
    expect(ApiError.parse(await body(bad)).code).toBe('bad_request');
  });

  it('target profession must come from the list', async () => {
    const { token } = await signUp('meslek@example.invalid');
    const list = await body(await professionsGet(api('/v1/professions', null)));
    expect(list.length).toBeGreaterThan(3);
    const ok = await targetProfessionPut(
      api('/v1/me/target-profession', token, {
        method: 'PUT',
        body: JSON.stringify({ professionId: 'avukat', avatar: 'avukat-n' }),
      }),
    );
    expect(await body(ok)).toMatchObject({ targetProfession: 'avukat', avatar: 'avukat-n' });
    const bad = await targetProfessionPut(
      api('/v1/me/target-profession', token, {
        method: 'PUT',
        body: JSON.stringify({ professionId: 'astronot' }),
      }),
    );
    expect(bad.status).toBe(400);
  });

  it('consents are versioned and append only', async () => {
    const { token } = await signUp('riza@example.invalid');
    const post = (granted: boolean, version: string) =>
      consentsPost(
        api('/v1/me/consents', token, {
          method: 'POST',
          body: JSON.stringify({ kind: 'acik_riza_pazarlama', version, granted }),
        }),
      );
    expect((await post(true, '2026-10-01')).status).toBe(201);
    expect((await post(false, '2026-10-01')).status).toBe(201);
    const list = await body(await consentsGet(api('/v1/me/consents', token)));
    expect(list.map((c: { granted: boolean }) => c.granted)).toEqual([true, false]);
    await expect(h.pg.query('update consents set granted = true')).rejects.toThrow(/append only/);
  });

  it('KVKK application is recorded', async () => {
    const { token } = await signUp('kvkk@example.invalid');
    const res = await kvkkPost(
      api('/v1/kvkk-requests', token, {
        method: 'POST',
        body: JSON.stringify({ kind: 'bilgi', detail: 'Hangi verilerimi isliyorsunuz?' }),
      }),
    );
    expect(res.status).toBe(201);
    const r = KvkkReceipt.parse(await body(res));
    expect(r.status).toBe('alindi');
    expect(Date.parse(r.dueAt) - Date.parse(r.receivedAt)).toBe(30 * 86_400_000);
    const [row] = await h.db.select().from(schema.kvkkRequests).where(eq(schema.kvkkRequests.id, r.id));
    expect(row?.contactEmail).toBe('kvkk@example.invalid');
    const [q] = await h.db
      .select()
      .from(schema.reviewQueueItems)
      .where(eq(schema.reviewQueueItems.subjectId, r.id));
    expect(q?.queue).toBe('kvkk-requests');
    const posta = await kvkkPost(
      api('/v1/kvkk-requests', token, {
        method: 'POST',
        body: JSON.stringify({ kind: 'silme', detail: 'x', replyChannel: 'posta' }),
      }),
    );
    expect(posta.status).toBe(400);
  });

  it('export returns JSON and CSV without secrets', async () => {
    const { token } = await signUp('ihrac@example.invalid');
    const j = await meExport(api('/v1/me/export?format=json', token));
    expect(j.status).toBe(200);
    const data = await body(j);
    expect(data.user.email).toBe('ihrac@example.invalid');
    expect(JSON.stringify(data)).not.toMatch(/password|codeHash|token/i);
    const c = await meExport(api('/v1/me/export?format=csv', token));
    expect(c.headers.get('content-type')).toMatch(/text\/csv/);
    const csv = await c.text();
    expect(csv.split('\r\n')[0]).toBe('section,row,field,value');
    expect(csv).toContain('ihrac@example.invalid');
    expect((await meExport(api('/v1/me/export?format=xml', token))).status).toBe(400);
  });

  it('DELETE ends every session and blocks new sign ins', async () => {
    const { token } = await signUp('sil@example.invalid');
    const res = await meDelete(api('/v1/me', token, { method: 'DELETE' }));
    expect(res.status).toBe(202);
    const { jobId } = await body(res);
    const [job] = await h.db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
    expect(job?.type).toBe('account.purge');
    expect((job?.runAfter.getTime() ?? 0) - h.clock.now.getTime()).toBe(14 * 86_400_000);
    expect((await meGet(api('/v1/me', token))).status).toBe(401);
    const again = await authHandler(
      authReq('/sign-in/email', { email: 'sil@example.invalid', password: 'parola-cok-gizli-1' }),
    );
    expect(again.status).not.toBe(200);
  });
});

describe('edu.tr verification', () => {
  it('accepts edu.tr sub domains only', () => {
    expect(isEduTrEmail('ogr@ogr.ankara.edu.tr')).toBe(true);
    expect(isEduTrEmail('ad@asbu.edu.tr')).toBe(true);
    expect(isEduTrEmail('ad@edu.tr.example.com')).toBe(false);
    expect(isEduTrEmail('ad@notedu.tr')).toBe(false);
    expect(isEduTrEmail('ad@gmail.com')).toBe(false);
  });

  it('6 digit code, wrong code rejected, role granted, yearly renewal revokes', async () => {
    const { token } = await signUp('ogrenci@example.invalid');
    const start = (email: string) =>
      eduStart(api('/v1/me/edu-verification', token, { method: 'POST', body: JSON.stringify({ email }) }));
    expect((await start('ogrenci@gmail.com')).status).toBe(400);
    expect((await start('ogrenci@ogr.ornek.edu.tr')).status).toBe(204);
    const code = h.mailer.last('ogrenci@ogr.ornek.edu.tr', 'edu')?.code ?? '';
    expect(code).toMatch(/^[0-9]{6}$/);
    const confirm = (c: string) =>
      eduConfirm(
        api('/v1/me/edu-verification/confirm', token, { method: 'POST', body: JSON.stringify({ code: c }) }),
      );
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await confirm(wrong)).status).toBe(400);
    const ok = await confirm(code);
    expect(ok.status).toBe(200);
    const me = await body(ok);
    expect(me.eduVerified).toBe(true);
    expect(me.roles).toContain('ogrenci_dogrulanmis');

    const later = new Date(h.clock.now.getTime() + 366 * 24 * 3600 * 1000);
    const revoked = await expireEduVerifications(h.db, h.ctx.config.secret, later);
    expect(revoked).toContain(me.id);
    const after = await body(await meGet(api('/v1/me', token)));
    expect(after.eduVerified).toBe(false);
    expect(after.roles).not.toContain('ogrenci_dogrulanmis');
  });
});
