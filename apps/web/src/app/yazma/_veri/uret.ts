/**
 * Regenerates the JSON copies of the content files that the app reads at run time:
 *   node apps/web/src/app/yazma/_veri/uret.ts
 * content/kisaltmalar.yaml -> yazma/_veri/kisaltmalar.json
 * content/kalemcik.yaml    -> kalemcik/_veri/kalemcik.json and worker-node kalemcik/_veri/kalemcik.json
 * The YAML files are the source (plan 10.5/6 and 10.5/7); icerik.test.ts fails when a copy drifts from it.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { parse } from 'yaml';

const yol = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export const kopyalar = [
  { kaynak: '../../../../../../content/kisaltmalar.yaml', hedef: './kisaltmalar.json' },
  { kaynak: '../../../../../../content/kalemcik.yaml', hedef: '../../kalemcik/_veri/kalemcik.json' },
  { kaynak: '../../../../../../content/kalemcik.yaml', hedef: '../../../../../worker-node/src/kalemcik/_veri/kalemcik.json' },
] as const;

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const k of kopyalar) {
    const hedef = yol(k.hedef);
    mkdirSync(dirname(hedef), { recursive: true });
    const veri = parse(readFileSync(yol(k.kaynak), 'utf8'));
    const ayar = (await resolveConfig(hedef)) ?? {};
    writeFileSync(hedef, await format(JSON.stringify(veri), { ...ayar, parser: 'json' }));
    console.log(`${k.hedef} yazıldı`);
  }
}
