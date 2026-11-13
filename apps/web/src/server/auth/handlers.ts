import {
  AdminFeatureFlagInput,
  AdminLedgerAdjustmentInput,
  AdminPriceTableInput,
  AdminProfessionInput,
  AdminQueueDecisionInput,
  AdminWeightsInput,
  ConsentInput,
  EduVerificationConfirm,
  EduVerificationStart,
  KvkkGuestRequestInput,
  KvkkGuestVerifyInput,
  KvkkRequestInput,
  MePatch,
  MeDeleteInput,
  ReviewQueueName,
  StepUpConfirmInput,
  TakedownRequestInput,
  TargetProfessionInput,
} from '@kazuist/contracts';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import type { z } from 'zod';
import {
  deleteMe,
  exportData,
  getMe,
  listConsents,
  patchMe,
  recordConsent,
  setTargetProfession,
  toCsv,
} from './account.ts';
import { decideQueueItem, listFlags, listQueue, searchUsers, setFlag } from './admin.ts';
import { getAuthContext } from './context.ts';
import { confirmEduVerification, startEduVerification } from './edu.ts';
import { checkIp, originAllowed, resolvePrincipal, withAuth, withPublic } from './guard.ts';
import { apiError, json, rateLimited, readJson } from './http.ts';
import { createGuestKvkkRequest, createKvkkRequest, verifyGuestKvkkRequest } from './kvkk.ts';
import { listProfessions } from './professions.ts';
import { rules } from './rate-limit.ts';
import type { Role } from './roles.ts';
import { confirmSecondStep, hasPasskeySession, hasTotpEnabled } from './step-up.ts';
import { createTakedownRequest } from './takedown.ts';

/** Route handlers for /api/v1/{me,kvkk-requests,professions,takedown-requests,admin}/** and /api/auth/**. */

const noContent = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export const meGet = withAuth({ rate: rules.meUser }, async (_req, p, ctx) => {
  const me = await getMe(ctx, p.userId);
  return me ? json(me) : apiError('unauthorized');
});

export const mePatch = withAuth({ rate: rules.meUser }, async (req, p, ctx) => {
  const body = MePatch.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  return json(await patchMe(ctx, p, body.data));
});

export const meDelete = withAuth({ rate: rules.meUser }, async (req, p, ctx) => {
  const raw = await req.text();
  let value: unknown = {};
  if (raw.trim()) {
    try {
      value = JSON.parse(raw);
    } catch {
      return apiError('bad_request');
    }
  }
  const input = MeDeleteInput.safeParse(value);
  if (!input.success) return apiError('bad_request');
  const jobId = await deleteMe(ctx, p, input.data.requestRefund);
  return json({ jobId }, 202);
});

export const meExport = withAuth({ rate: rules.exportUser }, async (req, p, ctx) => {
  const format = new URL(req.url).searchParams.get('format') ?? 'json';
  if (format !== 'json' && format !== 'csv') return apiError('bad_request');
  const data = await exportData(ctx, p.userId);
  const day = ctx.now().toISOString().slice(0, 10);
  if (format === 'csv') {
    return new Response(toCsv(data), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kazuist-verilerim-${day}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  return json(data, 200, { 'Content-Disposition': `attachment; filename="kazuist-verilerim-${day}.json"` });
});

export const consentsGet = withAuth({ rate: rules.meUser }, async (_req, p, ctx) =>
  json(await listConsents(ctx, p.userId)),
);

export const consentsPost = withAuth({ rate: rules.meUser }, async (req, p, ctx) => {
  const body = ConsentInput.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  return json(await recordConsent(ctx, p, body.data, { userAgent: req.headers.get('user-agent') }), 201);
});

export const targetProfessionPut = withAuth({ rate: rules.meUser }, async (req, p, ctx) => {
  const body = TargetProfessionInput.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  const me = await setTargetProfession(ctx, p, body.data.professionId, body.data.avatar);
  return me === 'unknown_profession' ? apiError('bad_request') : json(me);
});

/** Contract v1.1: 204, the code is sent synchronously. */
export const eduStart = withAuth({ rate: rules.eduUser }, async (req, p, ctx) => {
  const body = EduVerificationStart.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  const r = await startEduVerification(
    ctx.db,
    ctx.mailer,
    ctx.config.secret,
    p.userId,
    body.data.email,
    ctx.now(),
  );
  return r === 'not_edu' ? apiError('bad_request', tr.hata.eduDegil) : noContent();
});

export const eduConfirm = withAuth({ rate: rules.meUser }, async (req, p, ctx) => {
  const body = EduVerificationConfirm.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  const r = await confirmEduVerification(ctx.db, ctx.config.secret, p.userId, body.data.code, ctx.now());
  return r === 'verified' ? json(await getMe(ctx, p.userId)) : apiError('bad_request', tr.hata.kodHatali);
});

export const kvkkPost = withAuth({ rate: rules.kvkkUser }, async (req, p, ctx) => {
  const body = KvkkRequestInput.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  const r = await createKvkkRequest(ctx, p, body.data);
  return r === 'address_required' ? apiError('bad_request') : json(r, 201);
});

export const kvkkGuestPost = withPublic(rules.kvkkGuestIp, async (req, ctx) => {
  const body = KvkkGuestRequestInput.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  const r = await createGuestKvkkRequest(ctx, body.data);
  if (r === 'invalid_identity') return apiError('bad_request');
  if (r === 'unavailable') return apiError('unavailable');
  return json(r, 202);
});

export const kvkkGuestVerify = withPublic(rules.kvkkVerifyIp, async (req, ctx) => {
  const body = KvkkGuestVerifyInput.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  const perId = await ctx.limiter.check(rules.kvkkVerifyId, body.data.id);
  if (!perId.ok) return rateLimited(perId.retryAfterSec);
  const r = await verifyGuestKvkkRequest(ctx, body.data.id, body.data.code);
  if (r === 'not_found') return apiError('not_found');
  if (r === 'invalid') return apiError('bad_request', tr.hata.kodHatali);
  return json(r);
});

export const takedownPost = withPublic(rules.takedownIp, async (req, ctx) => {
  const body = TakedownRequestInput.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  const r = await createTakedownRequest(ctx, body.data);
  return r === 'unknown_target' ? apiError('bad_request') : json({ id: r }, 201);
});

export const professionsGet = withPublic(rules.publicIp, async () =>
  json(listProfessions(), 200, { 'Cache-Control': 'public, max-age=300' }),
);

/**
 * Admin second step: TOTP (Better Auth two-factor) on a session opened with a passkey. Enrolment is the
 * Better Auth /api/auth/two-factor/enable and /verify-totp flow. 204 on success.
 */
export const stepUpConfirm = withAuth(
  { roles: ['editor', 'yonetici'], rate: rules.stepUpUser },
  async (req, p, ctx) => {
    const body = StepUpConfirmInput.safeParse(await readJson(req));
    if (!body.success) return apiError('bad_request');
    if (
      !(await hasPasskeySession(ctx.db, p.sessionId, p.userId)) ||
      !(await hasTotpEnabled(ctx.db, p.userId))
    ) {
      return apiError('forbidden', tr.hata.ikinciAdim);
    }
    const ok = await confirmSecondStep(ctx, req.headers, p.sessionId, p.userId, body.data.code);
    return ok ? noContent() : apiError('bad_request', tr.hata.kodHatali);
  },
);

/* Admin endpoints (/api/v1/admin/**): every one requires a staff role, a passkey session and the TOTP step. */

const staff: Role[] = ['editor', 'yonetici'];
const cursorOf = (req: Request) => new URL(req.url).searchParams.get('cursor');

export const adminQueueGet = withAuth(
  { admin: staff, rate: rules.adminUser },
  async (req, _p, ctx, params) => {
    const q = ReviewQueueName.safeParse(params.queue);
    if (!q.success) return apiError('bad_request');
    return json(await listQueue(ctx, q.data, cursorOf(req)));
  },
);

export const adminQueueDecide = withAuth(
  { admin: staff, rate: rules.adminUser },
  async (req, p, ctx, params) => {
    const q = ReviewQueueName.safeParse(params.queue);
    const id = /^[0-9a-f-]{36}$/.test(params.itemId ?? '') ? params.itemId : undefined;
    const body = AdminQueueDecisionInput.safeParse(await readJson(req));
    if (!q.success || !id || !body.success) return apiError('bad_request');
    const r = await decideQueueItem(ctx, p.userId, q.data, id, body.data);
    return r === 'not_found' ? apiError('not_found') : json({ ok: true });
  },
);

export const adminFlagsGet = withAuth({ admin: true, rate: rules.adminUser }, async (_req, _p, ctx) =>
  json(await listFlags(ctx)),
);

export const adminFlagsPut = withAuth({ admin: true, rate: rules.adminUser }, async (req, p, ctx) => {
  const body = AdminFeatureFlagInput.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  await setFlag(ctx, p.userId, body.data);
  return json({ ok: true });
});

export const adminUsersGet = withAuth({ admin: true, rate: rules.adminUser }, async (req, p, ctx) => {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 3 || q.length > 200) return apiError('bad_request');
  return json(await searchUsers(ctx, p.userId, q, cursorOf(req)));
});

export const adminProfessionsGet = withAuth({ admin: true, rate: rules.adminUser }, async () =>
  json(listProfessions()),
);

/**
 * Authorised and validated, but the store belongs to another module (odeme: prices, ledger; casuist:
 * weights; reports: odeme and casuist; professions table: ADR-0023 Ertelenen). 503 until wired.
 */
const notWired = <T extends z.ZodType>(schema: T | null) =>
  withAuth({ admin: true, rate: rules.adminUser }, async (req) => {
    if (schema && !schema.safeParse(await readJson(req)).success) return apiError('bad_request');
    return apiError('unavailable');
  });

export const adminPricesGet = notWired(null);
export const adminPricesPost = notWired(AdminPriceTableInput);
export const adminProfessionsPost = notWired(AdminProfessionInput);
export const adminWeightsGet = notWired(null);
export const adminWeightsPut = notWired(AdminWeightsInput);
export const adminLedgerPost = notWired(AdminLedgerAdjustmentInput);
export const adminReportsGet = notWired(null);

/** Paths under /api/auth that send an e-mail code get the stricter per IP rule. */
const codePaths = [
  '/email-otp/send-verification-otp',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
  '/sign-up/email',
];

/** Better Auth handler behind the shared limiter. */
export async function authHandler(req: Request): Promise<Response> {
  const ctx = await getAuthContext();
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, '');
  const d = await checkIp(ctx, req, rules.authIp);
  if (!d.ok) return rateLimited(d.retryAfterSec);
  if (req.method === 'POST' && codePaths.includes(path)) {
    const c = await checkIp(ctx, req, rules.codeIp);
    if (!c.ok) return rateLimited(c.retryAfterSec);
  }
  return ctx.auth.handler(req);
}

export { originAllowed, resolvePrincipal };
