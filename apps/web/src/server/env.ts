/**
 * Critical environment variables. /api/health returns 503 when any of them is missing.
 * Values are never returned or logged, only presence.
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

export function envChecks(
  env: Record<string, string | undefined> = process.env,
): Record<string, 'ok' | 'missing'> {
  return Object.fromEntries(criticalEnv.map((k) => [k, env[k] ? 'ok' : 'missing']));
}
