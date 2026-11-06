/**
 * Regenerates kurallar.json from docs/tespit/yazim-kurallari.md:
 *   node apps/web/src/app/tespit/_veri/uret.ts
 * The test in tespit.test.ts fails when the committed JSON differs from this output.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { ayristir } from './ayristir.ts';

const kaynak = fileURLToPath(new URL('../../../../../../docs/tespit/yazim-kurallari.md', import.meta.url));
const hedef = fileURLToPath(new URL('./kurallar.json', import.meta.url));

const json = JSON.stringify(ayristir(readFileSync(kaynak, 'utf8')));
const ayar = (await resolveConfig(hedef)) ?? {};
writeFileSync(hedef, await format(json, { ...ayar, parser: 'json' }));
console.log(`kurallar.json written from ${kaynak}`);
