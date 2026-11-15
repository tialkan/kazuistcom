import { createOTP } from '@better-auth/utils/otp';
import type { BillingService } from '@kazuist/ledger/billing';
import { BillingError } from '@kazuist/ledger/billing';
import { setBillingService } from '../../billing/context.ts';
import { adminPendingRefundsGet, adminRefundResolvePost } from '../admin-refunds.ts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '../db.ts';
import {
  adminFlagsGet,
  adminFlagsPut,
  adminLedgerPost,
  adminQueueDecide,
  adminQueueGet,
  adminUsersGet,
  kvkkGuestPost,
  kvkkGuestVerify,
  meGet,
  stepUpConfirm,
  takedownPost,
} from '../handlers.ts';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { decryptPii, isValidTckn } from '../pii.ts';
import { api, createHarness, params, signUp, type Harness } from './harness.ts';

let h: Harness;
const body = async (r: Response) => JSON.parse(await r.text());
const post = (data: unknown, method = 'POST') => ({ method, body: JSON.stringify(data) });

function base32Decode(s: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes).toString('utf8');
}

/** A yonetici with a passkey session (auth_method set as the passkey hook would) and TOTP enrolled. */
async function admin(email: string): Promise<{ token: string; secret: string; id: string }> {
  let { token } = await signUp(email);
  const id = (await body(await meGet(api('/v1/me', token)))).id as string;
  await h.db.insert(schema.userRoles).values({ userId: id, roleId: 'yonetici' });
  await h.db.update(schema.sessions).set({ authMethod: 'passkey' }).where(eq(schema.sessions.userId, id));
  const auth = () => new Headers({ authorization: `Bearer ${token}` });
  const en = (await h.ctx.auth.api.enableTwoFactor({
    body: { password: 'parola-cok-gizli-1' },
    headers: auth(),
  })) as { totpURI: string };
  const secret = base32Decode(new URL(en.totpURI).searchParams.get('secret') ?? '');
  const code = await createOTP(secret).totp();
  const res = await h.ctx.auth.api.verifyTOTP({ body: { code }, headers: auth(), returnHeaders: true });
  token = res.headers.get('set-auth-token') ?? token;
  return { token, secret, id };
}

beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

describe('sessions record how they were opened', () => {
  it('password sign up writes auth_method password', async () => {
    const { token } = await signUp('yontem@example.invalid');
    const id = (await body(await meGet(api('/v1/me', token)))).id;
    const [s] = await h.db.select().from(schema.sessions).where(eq(schema.sessions.userId, id));
    expect(s?.authMethod).toBe('password');
  });
});

describe('admin: passkey session plus TOTP second step', () => {
  it('opens admin endpoints only after a valid TOTP on a passkey session', async () => {
    const adm = await admin('yonetici@example.invalid');
    const [s] = await h.db.select().from(schema.sessions).where(eq(schema.sessions.userId, adm.id));
    expect(s?.authMethod).toBe('passkey');
    expect((await adminFlagsGet(api('/v1/admin/flags', adm.token))).status).toBe(403);
    const bad = await stepUpConfirm(api('/auth/step-up/confirm', adm.token, post({ code: '000000' })));
    expect([400, 204]).toContain(bad.status);
    const ok = await stepUpConfirm(
      api('/auth/step-up/confirm', adm.token, post({ code: await createOTP(adm.secret).totp() })),
    );
    expect(ok.status).toBe(204);
    expect((await adminFlagsGet(api('/v1/admin/flags', adm.token))).status).toBe(200);
    expect(
      (await adminFlagsPut(api('/v1/admin/flags', adm.token, post({ key: 'kampus', enabled: true }, 'PUT'))))
        .status,
    ).toBe(200);
    expect(await body(await adminFlagsGet(api('/v1/admin/flags', adm.token)))).toEqual([
      { key: 'kampus', enabled: true, rolloutPercent: 100 },
    ]);
    const users = await body(await adminUsersGet(api('/v1/admin/users?q=yonetici', adm.token)));
    expect(users.map((u: { email: string }) => u.email)).toEqual(['yonetici@example.invalid']);
    // Module owned stores answer 503 after authorisation and validation.
    expect((await adminLedgerPost(api('/v1/admin/ledger-adjustments', adm.token, post({})))).status).toBe(
      400,
    );
    const [audit] = await h.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'admin.flag.set'));
    expect(audit?.actorId).toBe(adm.id);
  });

  it('a password session never passes, even with TOTP', async () => {
    const adm = await admin('yonetici2@example.invalid');
    await h.db
      .update(schema.sessions)
      .set({ authMethod: 'password' })
      .where(eq(schema.sessions.userId, adm.id));
    const r = await stepUpConfirm(
      api('/auth/step-up/confirm', adm.token, post({ code: await createOTP(adm.secret).totp() })),
    );
    expect(r.status).toBe(403);
    expect((await adminFlagsGet(api('/v1/admin/flags', adm.token))).status).toBe(403);
  });
});

describe('pending refund administration', () => {
  it('requires passkey and second step, validates inputs, passes the actor and returns conflicts', async () => {
    const ref = 'paket:00000000-0000-4000-8000-000000000001';
    const decisions: unknown[][] = [];
    setBillingService({
      listPendingRefunds: async () => [{ refundRef: ref, amountKurus: 34900 }],
      resolvePendingRefund: async (...args: unknown[]) => {
        if (decisions.length) throw new BillingError(409, 'not_pending');
        decisions.push(args);
      },
    } as unknown as BillingService);
    try {
      expect((await adminPendingRefundsGet(api('/v1/admin/refunds/pending', null))).status).toBe(401);
      const user = await signUp('refund-user@example.invalid');
      expect((await adminPendingRefundsGet(api('/v1/admin/refunds/pending', user.token))).status).toBe(403);
      const adm = await admin('refund-admin@example.invalid');
      expect((await adminPendingRefundsGet(api('/v1/admin/refunds/pending', adm.token))).status).toBe(403);
      await stepUpConfirm(
        api('/auth/step-up/confirm', adm.token, post({ code: await createOTP(adm.secret).totp() })),
      );
      const list = await adminPendingRefundsGet(api('/v1/admin/refunds/pending', adm.token));
      expect(list.status).toBe(200);
      expect(await body(list)).toEqual([{ refundRef: ref, amountKurus: 34900 }]);
      const resolve = (value: unknown, refundRef = ref) =>
        adminRefundResolvePost(
          api(`/v1/admin/refunds/${refundRef}/resolve`, adm.token, post(value)),
          params({ refundRef }),
        );
      expect((await resolve({ outcome: 'basarili', extra: true })).status).toBe(400);
      expect((await resolve({ outcome: 'unknown' })).status).toBe(400);
      expect((await resolve({ outcome: 'basarili' }, 'invalid')).status).toBe(400);
      expect((await resolve({ outcome: 'basarisiz' })).status).toBe(204);
      expect(decisions).toEqual([[ref, 'basarisiz', adm.id]]);
      expect((await resolve({ outcome: 'basarili' })).status).toBe(409);
    } finally {
      setBillingService(undefined);
    }
  });
});

describe('takedown requests (72 hours, 30 days, audited)', () => {
  it('intake, temporary hiding, final decision', async () => {
    const rec = (
      await h.pg.query<{ id: string }>(
        `insert into records (type, title, authority_class, license_basis, source_url, source_key, fetched_at, text)
         values ('karar', 'Ornek', 'emsal', 'FSEK m.31', 'https://example.invalid/k/9', 'test:9', now(), 'metin') returning id`,
      )
    ).rows[0]?.id as string;
    const res = await takedownPost(
      api(
        '/v1/takedown-requests',
        null,
        post({
          kind: 'kisisel_veri',
          targetType: 'record',
          targetId: rec,
          reason: 'Adim geciyor',
          contactEmail: 'k@example.invalid',
        }),
      ),
    );
    expect(res.status).toBe(201);
    const { id } = await body(res);
    const [t] = await h.db.select().from(schema.takedownRequests).where(eq(schema.takedownRequests.id, id));
    expect((t?.hideDueAt.getTime() ?? 0) - (t?.createdAt.getTime() ?? 0)).toBe(72 * 3_600_000);
    expect((t?.dueAt?.getTime() ?? 0) - (t?.createdAt.getTime() ?? 0)).toBe(30 * 86_400_000);
    const unknown = await takedownPost(
      api(
        '/v1/takedown-requests',
        null,
        post({
          kind: 'telif',
          targetType: 'record',
          targetId: '00000000-0000-4000-8000-000000000000',
          reason: 'x',
          contactEmail: 'k@example.invalid',
        }),
      ),
    );
    expect(unknown.status).toBe(400);

    const adm = await admin('editor@example.invalid');
    await stepUpConfirm(
      api('/auth/step-up/confirm', adm.token, post({ code: await createOTP(adm.secret).totp() })),
    );
    const q = await body(
      await adminQueueGet(api('/v1/admin/queues/takedowns', adm.token), params({ queue: 'takedowns' })),
    );
    const item = q.find((i: { subjectId: string }) => i.subjectId === id);
    expect(item).toBeTruthy();
    const decide = (decision: string) =>
      adminQueueDecide(
        api(
          `/v1/admin/queues/takedowns/${item.id}/decision`,
          adm.token,
          post({ decision, note: 'inceleme' }),
        ),
        params({ queue: 'takedowns', itemId: item.id }),
      );
    expect((await decide('onay')).status).toBe(200);
    const hidden = await h.pg.query<{ hidden_at: Date | null }>(
      'select hidden_at from records where id = $1',
      [rec],
    );
    expect(hidden.rows[0]?.hidden_at).not.toBeNull();
    expect((await decide('ret')).status).toBe(200);
    const [done] = await h.db
      .select()
      .from(schema.takedownRequests)
      .where(eq(schema.takedownRequests.id, id));
    expect(done).toMatchObject({ status: 'sonuclandi', decision: 'ret', decidedBy: adm.id });
    const shown = await h.pg.query<{ hidden_at: Date | null }>(
      'select hidden_at from records where id = $1',
      [rec],
    );
    expect(shown.rows[0]?.hidden_at).toBeNull();
    expect((await decide('onay')).status).toBe(404);
  });
});

describe('takedown decisions keep the target hidden while any request requires it', () => {
  let adm: { token: string; secret: string; id: string };
  let n = 0;

  beforeAll(async () => {
    adm = await admin('kaldirma-editor@example.invalid');
    await stepUpConfirm(
      api('/auth/step-up/confirm', adm.token, post({ code: await createOTP(adm.secret).totp() })),
    );
  });

  async function record(): Promise<string> {
    n += 1;
    return (
      await h.pg.query<{ id: string }>(
        `insert into records (type, title, authority_class, license_basis, source_url, source_key, fetched_at, text)
         values ('karar', 'Ornek', 'emsal', 'FSEK m.31', 'https://example.invalid/k/t', $1, now(), 'metin')
         returning id`,
        [`test:gizle:${n}`],
      )
    ).rows[0]?.id as string;
  }

  async function request(rec: string): Promise<string> {
    const res = await takedownPost(
      api(
        '/v1/takedown-requests',
        null,
        post({
          kind: 'kisisel_veri',
          targetType: 'record',
          targetId: rec,
          reason: 'Adim geciyor',
          contactEmail: 'k@example.invalid',
        }),
      ),
    );
    expect(res.status).toBe(201);
    return (await body(res)).id as string;
  }

  async function decide(takedownId: string, decision: 'onay' | 'ret' | 'duzelt') {
    const q = await body(
      await adminQueueGet(api('/v1/admin/queues/takedowns', adm.token), params({ queue: 'takedowns' })),
    );
    const item = q.find((i: { subjectId: string }) => i.subjectId === takedownId);
    expect(item).toBeTruthy();
    const res = await adminQueueDecide(
      api(`/v1/admin/queues/takedowns/${item.id}/decision`, adm.token, post({ decision, note: 'inceleme' })),
      params({ queue: 'takedowns', itemId: item.id }),
    );
    expect(res.status).toBe(200);
  }

  const hiddenAt = async (rec: string) =>
    (await h.pg.query<{ hidden_at: Date | null }>('select hidden_at from records where id = $1', [rec]))
      .rows[0]?.hidden_at ?? null;
  const remaskJobs = async (rec: string) =>
    (
      await h.pg.query<{ payload: unknown; dedupe_key: string }>(
        `select payload, dedupe_key from jobs where type = 'anon.run' and payload ->> 'recordId' = $1`,
        [rec],
      )
    ).rows;

  it('ek_maskeleme keeps the record hidden and queues anon.run once', async () => {
    const rec = await record();
    const a = await request(rec);
    await decide(a, 'onay');
    const firstHidden = await hiddenAt(rec);
    expect(firstHidden).not.toBeNull();
    await decide(a, 'duzelt');
    const [t] = await h.db.select().from(schema.takedownRequests).where(eq(schema.takedownRequests.id, a));
    expect(t).toMatchObject({ status: 'sonuclandi', decision: 'ek_maskeleme' });
    expect((await hiddenAt(rec))?.getTime()).toBe(firstHidden?.getTime());
    expect(await remaskJobs(rec)).toEqual([{ payload: { recordId: rec }, dedupe_key: `anon:${rec}` }]);
  });

  it('ek_maskeleme straight from bekliyor hides the record', async () => {
    const rec = await record();
    const a = await request(rec);
    await decide(a, 'duzelt');
    expect(await hiddenAt(rec)).not.toBeNull();
    expect(await remaskJobs(rec)).toHaveLength(1);
  });

  it('ret does not show a record another request keeps temporarily hidden', async () => {
    const rec = await record();
    const a = await request(rec);
    const b = await request(rec);
    await decide(a, 'onay');
    await decide(b, 'onay');
    await decide(a, 'ret');
    expect(await hiddenAt(rec)).not.toBeNull();
    // The last open request decides: rejecting it too shows the record again.
    await decide(b, 'ret');
    expect(await hiddenAt(rec)).toBeNull();
  });

  it('ret does not show a record removed permanently or masked by another request', async () => {
    for (const final of ['onay', 'duzelt'] as const) {
      const rec = await record();
      const a = await request(rec);
      const b = await request(rec);
      await decide(a, 'onay');
      await decide(b, 'onay');
      await decide(a, final);
      await decide(b, 'ret');
      expect(await hiddenAt(rec)).not.toBeNull();
    }
  });

  it('ret of a request that never hid the target leaves the hiding of another request alone', async () => {
    const rec = await record();
    const a = await request(rec);
    const b = await request(rec);
    await decide(a, 'onay');
    await decide(b, 'ret');
    expect(await hiddenAt(rec)).not.toBeNull();
  });

  /** The open release item of a takedown (opened by ek_maskeleme on a record), as the editor sees it. */
  async function releaseItem(takedownId: string): Promise<{ id: string; payload: Record<string, unknown> }> {
    const q = await body(
      await adminQueueGet(api('/v1/admin/queues/takedowns', adm.token), params({ queue: 'takedowns' })),
    );
    return q.find(
      (i: { subjectId: string; payload: { action?: string } }) =>
        i.subjectId === takedownId && i.payload.action === 'release_after_remask',
    );
  }

  async function release(takedownId: string, decision: 'onay' | 'ret' | 'duzelt', token = adm.token) {
    const item = await releaseItem(takedownId);
    expect(item).toBeTruthy();
    return adminQueueDecide(
      api(
        `/v1/admin/queues/takedowns/${item.id}/decision`,
        token,
        post({ decision, note: 'yeniden maskelendi' }),
      ),
      params({ queue: 'takedowns', itemId: item.id }),
    );
  }

  /**
   * What anon.run does for the record (services/worker-py/anonymizer/store.py): the job finishes, open
   * anonymization items are superseded, and either the masked text is published or, with spans for review, it
   * stays empty and a new anonymization item opens.
   */
  async function anonymiserRuns(rec: string, held = false) {
    await h.pg.query(
      `update jobs set status = 'done' where type = 'anon.run' and dedupe_key = $1 and status in ('queued', 'running')`,
      [`anon:${rec}`],
    );
    await h.pg.query(
      `update review_queue set decision = 'superseded', decided_at = now()
       where queue = 'anonymization' and subject_type = 'record' and subject_id = $1 and decision is null`,
      [rec],
    );
    if (held) {
      await h.pg.query(
        `insert into review_queue (queue, subject_type, subject_id, payload, priority)
         values ('anonymization', 'record', $1, '{"items": []}', 10)`,
        [rec],
      );
      await h.pg.query(`update records set anonymized = false, masked_text = null where id = $1`, [rec]);
    } else {
      await h.pg.query(`update records set anonymized = true, masked_text = '[maskeli]' where id = $1`, [
        rec,
      ]);
    }
  }

  it('ek_maskeleme: the record is shown again only after the re-mask is published and an editor approves', async () => {
    const rec = await record();
    const a = await request(rec);
    await decide(a, 'onay');
    await decide(a, 'duzelt');
    const item = await releaseItem(a);
    expect(item.payload).toEqual({ action: 'release_after_remask', takedownId: a, recordId: rec });

    // anon.run still queued: 409, the item stays open, the record stays hidden.
    const early = await release(a, 'onay');
    expect(early.status).toBe(409);
    expect((await body(early)).message).toBe(tr.hata.maskelemeBekliyor);
    expect(await hiddenAt(rec)).not.toBeNull();

    // The run is held for editor review: still 409, also after the anonymization item is approved, since
    // masked_text stays empty until the anonymiser publishes.
    await anonymiserRuns(rec, true);
    expect((await release(a, 'onay')).status).toBe(409);
    const anonQ = await body(
      await adminQueueGet(
        api('/v1/admin/queues/anonymization', adm.token),
        params({ queue: 'anonymization' }),
      ),
    );
    const anonItem = anonQ.find((i: { subjectId: string }) => i.subjectId === rec);
    const approved = await adminQueueDecide(
      api(`/v1/admin/queues/anonymization/${anonItem.id}/decision`, adm.token, post({ decision: 'onay' })),
      params({ queue: 'anonymization', itemId: anonItem.id }),
    );
    expect(approved.status).toBe(200);
    expect((await release(a, 'onay')).status).toBe(409);
    expect(await hiddenAt(rec)).not.toBeNull();

    // A non-staff account cannot release.
    const user = await signUp('kaldirma-kullanici@example.invalid');
    expect((await release(a, 'onay', user.token)).status).toBe(403);

    // Published: the editor's approval shows the record and closes the item, audited.
    await anonymiserRuns(rec);
    expect((await release(a, 'onay')).status).toBe(200);
    expect(await hiddenAt(rec)).toBeNull();
    expect(await releaseItem(a)).toBeUndefined();
    const audit = await h.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'takedown.release.onay'));
    expect(audit.find((r) => r.subjectId === a)?.diff).toMatchObject({
      reviewItem: item.id,
      result: 'shown',
    });
  });

  it('two masking requests: the record is shown when the last release is approved', async () => {
    const rec = await record();
    const a = await request(rec);
    const b = await request(rec);
    await decide(a, 'duzelt');
    await decide(b, 'duzelt');
    await anonymiserRuns(rec);
    expect((await release(a, 'onay')).status).toBe(200);
    expect(await hiddenAt(rec)).not.toBeNull();
    expect((await release(b, 'onay')).status).toBe(200);
    expect(await hiddenAt(rec)).toBeNull();
  });

  it('a released masking request no longer blocks ret of a temporarily hidden one', async () => {
    const rec = await record();
    const a = await request(rec);
    const b = await request(rec);
    await decide(a, 'duzelt');
    await decide(b, 'onay');
    await anonymiserRuns(rec);
    expect((await release(a, 'onay')).status).toBe(200);
    expect(await hiddenAt(rec)).not.toBeNull();
    await decide(b, 'ret');
    expect(await hiddenAt(rec)).toBeNull();
  });

  it('release stays hidden under permanent removal; release ret keeps the record hidden for good', async () => {
    const rec = await record();
    const a = await request(rec);
    const b = await request(rec);
    await decide(a, 'duzelt');
    await decide(b, 'onay');
    await decide(b, 'onay');
    await anonymiserRuns(rec);
    expect((await release(a, 'onay')).status).toBe(200);
    expect(await hiddenAt(rec)).not.toBeNull();

    const rec2 = await record();
    const c = await request(rec2);
    const d = await request(rec2);
    await decide(c, 'duzelt');
    await decide(d, 'onay');
    await anonymiserRuns(rec2);
    expect((await release(c, 'ret')).status).toBe(200);
    expect(await releaseItem(c)).toBeUndefined();
    await decide(d, 'ret');
    expect(await hiddenAt(rec2)).not.toBeNull();
  });

  it('release duzelt queues anon.run again and keeps the item open', async () => {
    const rec = await record();
    const a = await request(rec);
    await decide(a, 'duzelt');
    await anonymiserRuns(rec);
    expect((await release(a, 'duzelt')).status).toBe(200);
    const jobs = await h.pg.query<{ status: string }>(
      `select status from jobs where type = 'anon.run' and dedupe_key = $1 order by created_at`,
      [`anon:${rec}`],
    );
    expect(jobs.rows.map((r) => r.status)).toEqual(['done', 'queued']);
    expect(await releaseItem(a)).toBeTruthy();
    expect((await release(a, 'onay')).status).toBe(409);
    await anonymiserRuns(rec);
    expect((await release(a, 'onay')).status).toBe(200);
    expect(await hiddenAt(rec)).toBeNull();
  });
});

describe('KVKK application without an account', () => {
  const valid = {
    kind: 'silme',
    detail: 'Karar metninde adim geciyor.',
    requesterName: 'Deneme Kisi',
    nationality: 'TR',
    identityNumber: '10000000146',
    address: 'Ornek Mahallesi 1. Sokak No 1 Ankara',
    contactEmail: 'Misafir@Example.invalid',
    relation: 'karar_metninde_adi_gecen',
    replyChannel: 'eposta',
    declaration: true,
  };

  it('checks the T.C. kimlik checksum', () => {
    expect(isValidTckn('10000000146')).toBe(true);
    expect(isValidTckn('10000000147')).toBe(false);
    expect(isValidTckn('01234567890')).toBe(false);
  });

  it('records, encrypts the identity number, confirms with the e-mailed code', async () => {
    const bad = await kvkkGuestPost(
      api('/v1/kvkk-requests/guest', null, post({ ...valid, identityNumber: '12345678901' })),
    );
    expect(bad.status).toBe(400);
    const res = await kvkkGuestPost(api('/v1/kvkk-requests/guest', null, post(valid)));
    expect(res.status).toBe(202);
    const r = await body(res);
    expect(r.status).toBe('dogrulama_bekliyor');
    const [row] = await h.db.select().from(schema.kvkkRequests).where(eq(schema.kvkkRequests.id, r.id));
    expect(row?.identityEnc).not.toContain('10000000146');
    expect(decryptPii(h.ctx.config.piiKey, row?.identityEnc ?? '')).toBe('10000000146');
    expect(row?.userId).toBeNull();
    const code = h.mailer.last('misafir@example.invalid', 'kvkk-guest')?.code ?? '';
    const wrong = code === '000000' ? '111111' : '000000';
    expect(
      (await kvkkGuestVerify(api('/v1/kvkk-requests/guest/verify', null, post({ id: r.id, code: wrong }))))
        .status,
    ).toBe(400);
    const ok = await kvkkGuestVerify(api('/v1/kvkk-requests/guest/verify', null, post({ id: r.id, code })));
    expect(ok.status).toBe(200);
    expect((await body(ok)).status).toBe('alindi');
    expect(
      (
        await kvkkGuestVerify(
          api(
            '/v1/kvkk-requests/guest/verify',
            null,
            post({ id: '00000000-0000-4000-8000-000000000000', code }),
          ),
        )
      ).status,
    ).toBe(404);
    const audit = JSON.stringify(await h.db.select().from(schema.auditLog));
    expect(audit).not.toContain('10000000146');
    expect(audit).not.toContain('Adim');
  });

  it('limits guest applications per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const req = api('/v1/kvkk-requests/guest', null, post(valid));
      req.headers.set('x-forwarded-for', '198.51.100.9');
      statuses.push((await kvkkGuestPost(req)).status);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});
