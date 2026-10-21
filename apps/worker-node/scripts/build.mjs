#!/usr/bin/env node
// Production build of worker-node (docs/istekler/altyapi-worker-giris-noktalari.md item 3).
// Workspace packages (@kazuist/*) ship TypeScript sources, so they are bundled; npm dependencies stay
// external and are installed with `pnpm deploy --prod`. Output: dist/main.js, run with `node dist/main.js`.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'warning',
  plugins: [
    {
      name: 'external-npm-dependencies',
      setup(b) {
        // Bare imports other than workspace packages resolve from node_modules at run time.
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@kazuist/') ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});
console.log('worker-node: dist/main.js built');
