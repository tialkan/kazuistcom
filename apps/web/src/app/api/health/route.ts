import type { Health } from '@kazuist/contracts';
import { envChecks } from '@/server/env';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  const checks = envChecks();
  const ok = Object.values(checks).every((v) => v === 'ok');
  const body: Health = { status: ok ? 'ok' : 'degraded', checks };
  return Response.json(body, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
