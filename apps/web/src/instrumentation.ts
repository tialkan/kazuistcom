/**
 * Next.js instrumentation (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * instrumentation.md): register() runs once per server instance before requests are served. The Node.js
 * runtime registers the /api/health probes over the shared pg and Valkey clients; no connection is opened
 * here, the first probe connects.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [{ setHealthDeps }, { createHealthDeps }] = await Promise.all([
    import('./server/health.ts'),
    import('./server/deps.ts'),
  ]);
  setHealthDeps(createHealthDeps(process.env));
}
