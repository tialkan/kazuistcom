import {
  ConsentInput,
  EduVerificationConfirm,
  EduVerificationStart,
  KvkkRequestInput,
  MePatch,
  TargetProfessionInput,
} from '@kazuist/contracts';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import {
  createKvkkRequest,
  deleteMe,
  exportData,
  getMe,
  listConsents,
  patchMe,
  recordConsent,
  setTargetProfession,
  toCsv,
} from './account.ts';
import { getAuthContext } from './context.ts';
import { confirmEduVerification, startEduVerification } from './edu.ts';
import { withAuth, withPublic, originAllowed, resolvePrincipal } from './guard.ts';
import { apiError, json, rateLimited, readJson } from './http.ts';
import { listProfessions } from './professions.ts';
import { clientIp, rules } from './rate-limit.ts';
import { confirmSecondStep, hasPasskeySession, startSecondStep } from './step-up.ts';

/** Route handlers for /api/v1/me/**, /api/v1/professions, /api/v1/kvkk-requests and /api/auth/**. */

export const meGet = withAuth({ rate: rules.meUser }, async (_req, p, ctx) => {
  const me = await getMe(ctx, p.userId);
  return me ? json(me) : apiError('unauthorized');
});

export const mePatch = withAuth({ rate: rules.meUser }, async (req, p, ctx) => {
  const body = MePatch.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  return json(await patchMe(ctx, p, body.data));
});

export const meDelete = withAuth({ rate: rules.meUser }, async (_req, p, ctx) => {
  const jobId = await deleteMe(ctx, p);
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
  return r === 'not_edu'
    ? apiError('bad_request', tr.hata.eduDegil)
    : json({ jobId: crypto.randomUUID() }, 202);
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
  return json({ id: await createKvkkRequest(ctx, p, body.data) }, 201);
});

export const professionsGet = withPublic(rules.publicIp, async () =>
  json(listProfessions(), 200, { 'Cache-Control': 'public, max-age=300' }),
);

/** Admin second step: only for yonetici on a passkey session. */
export const stepUpStart = withAuth({ roles: ['yonetici'], rate: rules.eduUser }, async (_req, p, ctx) => {
  if (!(await hasPasskeySession(ctx.db, p.sessionId, p.userId, ctx.now()))) {
    return apiError('forbidden', tr.hata.ikinciAdim);
  }
  await startSecondStep(ctx.db, ctx.mailer, ctx.config.secret, p.sessionId, p.email, ctx.now());
  return json({ jobId: crypto.randomUUID() }, 202);
});

export const stepUpConfirm = withAuth({ roles: ['yonetici'], rate: rules.meUser }, async (req, p, ctx) => {
  const body = EduVerificationConfirm.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  const ok = await confirmSecondStep(
    ctx.db,
    ctx.config.secret,
    p.sessionId,
    p.userId,
    body.data.code,
    ctx.now(),
  );
  return ok ? json({ ok: true }) : apiError('bad_request', tr.hata.kodHatali);
});

/** Paths under /api/auth that send an e-mail code get the stricter per IP rule. */
const codePaths = ['/email-otp/send-verification-otp', '/forget-password/email-otp', '/sign-up/email'];

/** Better Auth handler behind the shared limiter. */
export async function authHandler(req: Request): Promise<Response> {
  const ctx = await getAuthContext();
  const ip = clientIp(req.headers, ctx.config.trustedProxies);
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, '');
  const d = await ctx.limiter.check(rules.authIp, ip);
  if (!d.ok) return rateLimited(d.retryAfterSec);
  if (req.method === 'POST' && codePaths.includes(path)) {
    const c = await ctx.limiter.check(rules.codeIp, ip);
    if (!c.ok) return rateLimited(c.retryAfterSec);
  }
  return ctx.auth.handler(req);
}

export { originAllowed, resolvePrincipal };
