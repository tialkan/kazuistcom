/* global fetch, Buffer */
// Static snapshot of the pre-launch pages (/ and /lansman) for the interim kazuist.com site.
// Usage: pnpm --filter @kazuist/web build && (cd apps/web && npx next start -p 3900) & node scripts/karsilama-snapshot.mjs
// Writes infra/karsilama/site, served by infra/karsilama/Dockerfile (nginx). Until the full stack is live.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const KOK = new URL('..', import.meta.url).pathname;
const HEDEF = join(KOK, 'infra/karsilama/site');
const SUNUCU = process.env.KARSILAMA_URL ?? 'http://localhost:3900';

await rm(HEDEF, { recursive: true, force: true });
await mkdir(HEDEF, { recursive: true });
for (const [yol, dosya] of [
  ['/', 'index.html'],
  ['/lansman', 'lansman.html'],
  ['/icon.svg', 'icon.svg'],
  ['/favicon.ico', 'favicon.ico'],
  ['/apple-icon.png', 'apple-icon.png'],
  ['/manifest.webmanifest', 'manifest.webmanifest'],
]) {
  const r = await fetch(SUNUCU + yol);
  if (!r.ok) throw new Error(`${yol} ${r.status}`);
  let govde = Buffer.from(await r.arrayBuffer());
  // The nonce only makes sense with the per-request CSP of the Next server; nginx sends its own headers.
  if (dosya.endsWith('.html')) govde = Buffer.from(govde.toString('utf8').replace(/ nonce="[^"]*"/g, ''));
  await writeFile(join(HEDEF, dosya), govde);
}
await cp(join(KOK, 'apps/web/.next/static'), join(HEDEF, '_next/static'), { recursive: true });
for (const d of ['karsilama', 'fonts'])
  await cp(join(KOK, 'apps/web/public', d), join(HEDEF, d), { recursive: true });
console.log('snapshot ok', HEDEF);
