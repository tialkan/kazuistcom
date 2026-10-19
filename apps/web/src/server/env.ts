/**
 * Critical environment variables. /api/health returns 503 when any is missing.
 * Names and values are never returned; only the overall state leaves the server.
 */
export const criticalEnv = [
  'DATABASE_URL',
  'VALKEY_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'BYOK_SIGNING_SECRET',
  'S3_ENDPOINT',
  'S3_BUCKET',
] as const;

export function missingEnv(env: Record<string, string | undefined> = process.env): string[] {
  return criticalEnv.filter((k) => !env[k]);
}
