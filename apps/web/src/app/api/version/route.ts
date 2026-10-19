import type { Version } from '@kazuist/contracts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  const body: Version = {
    version: process.env.APP_VERSION ?? '0.0.0',
    commit: process.env.GIT_COMMIT ?? 'unknown',
    builtAt: process.env.BUILT_AT ?? new Date(0).toISOString(),
  };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
