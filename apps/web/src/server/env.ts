/**
 * Critical environment variables. /api/health returns 503 when any is missing.
 * Names and values are never returned; only the overall state leaves the server.
 *
 * Only variables that running code reads belong here. S3_ENDPOINT and S3_BUCKET were listed before any code used
 * them, so a deployment without object storage could never turn healthy (review.md P2 madde 4). Nothing in
 * apps/web, apps/worker-node or packages reads them today and worker-py writes the raw archive to KAZUIST_RAW_DIR
 * (core/runtime.py, LocalObjectStore); add them back in the same change that wires an S3 client.
 */
export const criticalEnv = [
  'DATABASE_URL',
  'VALKEY_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'BYOK_SIGNING_SECRET',
  // Sign in, e-mail verification, password reset and edu.tr codes are mailed synchronously and throw without a
  // provider (server/auth/mailer.ts). Plan 14.6: no silent success, so a deployment without it is not healthy.
  'MAIL_SMTP_URL',
] as const;

export function missingEnv(env: Record<string, string | undefined> = process.env): string[] {
  return criticalEnv.filter((k) => !env[k]);
}
