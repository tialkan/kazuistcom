// Converts the original Casuist images (downloaded read-only from https://kazuist.com/<file>) into the
// AVIF and WebP variants served from apps/web/public/casuist. The SVG mark is copied unchanged.
// Usage: NODE_PATH=<dir containing sharp> node docs/tasarim/casuist-arsiv/gorselleri-donustur.mjs <download dir> apps/web/public/casuist
// The widths here must match apps/web/src/app/(casuist)/_bilesen/gorseller.ts (a test checks the files).
import { createRequire } from 'node:module';
import { copyFileSync, createReadStream, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const require = createRequire(join(process.env.NODE_PATH ?? process.cwd(), 'x.js'));
const sharp = require('sharp');
const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: <download dir> <output dir>');
mkdirSync(out, { recursive: true });

// original file, output base name, widths, photo (lossy) or mark (near lossless)
const jobs = [
  ['kazuist-baslik.webp', 'kazuist-baslik', [640, 960, 1280, 1600], 'foto'],
  ['eureka.png', 'eureka', [150, 300], 'logo'],
  ['eurostars.png', 'eurostars', [78, 156], 'logo'],
  ['hacettepe-logo.png', 'hacettepe', [16, 22, 32, 44], 'logo'],
  ['aybu-logo.png', 'aybu', [16, 22, 32, 44], 'logo'],
];

const sha = (p) =>
  new Promise((ok) => {
    const h = createHash('sha256');
    createReadStream(p)
      .on('data', (d) => h.update(d))
      .on('end', () => ok(h.digest('hex')));
  });

for (const [file, base, widths, kind] of jobs) {
  const input = join(src, file);
  const meta = await sharp(input).metadata();
  console.log(`${file} ${meta.width}x${meta.height} sha256 ${await sha(input)}`);
  for (const w of widths) {
    const img = () => sharp(input).resize({ width: w, withoutEnlargement: true });
    const avif = kind === 'foto' ? { quality: 55, effort: 6 } : { quality: 80, effort: 6 };
    const webp = kind === 'foto' ? { quality: 78, effort: 6 } : { quality: 92, alphaQuality: 100, effort: 6 };
    const a = await img().avif(avif).toFile(join(out, `${base}-${w}.avif`));
    const b = await img().webp(webp).toFile(join(out, `${base}-${w}.webp`));
    console.log(`  ${w}w ${a.width}x${a.height} avif ${a.size} B, webp ${b.size} B`);
  }
}
copyFileSync(join(src, 'tubitak.svg'), join(out, 'tubitak.svg'));
console.log(`tubitak.svg copied, sha256 ${await sha(join(src, 'tubitak.svg'))}`);
