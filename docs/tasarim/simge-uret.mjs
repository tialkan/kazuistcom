// Writes the raster icons from the hand drawn vector apps/web/src/app/icon.svg (ADR-0034 option B).
// Usage from the repository root:
//   NODE_PATH=<dir containing sharp> node docs/tasarim/simge-uret.mjs
// Outputs: app/favicon.ico (16, 32, 48 px PNG entries), app/apple-icon.png (180 px, opaque),
// public/icon-192.png, public/icon-512.png and public/icon-maskable-512.png (drawing scaled into the
// 80 percent safe zone). An optional path argument writes a preview sheet on light and dark grounds.
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(join(process.env.NODE_PATH ?? process.cwd(), 'x.js'));
const sharp = require('sharp');

const app = 'apps/web/src/app';
const pub = 'apps/web/public';
const kaynak = readFileSync(join(app, 'icon.svg'), 'utf8');

/** The drawing scaled around the centre, on the full paper ground (for padded icons). */
function olcekli(k) {
  const m = kaynak.match(/^([\s\S]*?<rect[^>]*\/>)([\s\S]*)(<\/svg>\s*)$/);
  if (!m) throw new Error('icon.svg: expected a background rect followed by the drawing');
  const c = 16 * (1 - k);
  return `${m[1]}<g transform="translate(${c} ${c}) scale(${k})">${m[2]}</g>${m[3]}`;
}

async function png(svg, boyut) {
  return sharp(Buffer.from(svg), { density: (72 * boyut) / 32 })
    .resize(boyut, boyut)
    .flatten({ background: '#fbf8f1' })
    .ensureAlpha()
    // Plain 8 bit RGBA: ICO decoders (Turbopack included) reject palette PNG entries.
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/** ICO container with PNG entries (supported by every current browser). */
function ico(girdiler) {
  const bas = Buffer.alloc(6 + 16 * girdiler.length);
  bas.writeUInt16LE(0, 0);
  bas.writeUInt16LE(1, 2);
  bas.writeUInt16LE(girdiler.length, 4);
  let ofset = bas.length;
  girdiler.forEach(([boyut, veri], i) => {
    const o = 6 + 16 * i;
    bas.writeUInt8(boyut >= 256 ? 0 : boyut, o);
    bas.writeUInt8(boyut >= 256 ? 0 : boyut, o + 1);
    bas.writeUInt8(0, o + 2);
    bas.writeUInt8(0, o + 3);
    bas.writeUInt16LE(1, o + 4);
    bas.writeUInt16LE(32, o + 6);
    bas.writeUInt32LE(veri.length, o + 8);
    bas.writeUInt32LE(ofset, o + 12);
    ofset += veri.length;
  });
  return Buffer.concat([bas, ...girdiler.map(([, veri]) => veri)]);
}

const favicon = await Promise.all([16, 32, 48].map(async (b) => [b, await png(kaynak, b)]));
writeFileSync(join(app, 'favicon.ico'), ico(favicon));
writeFileSync(join(app, 'apple-icon.png'), await png(olcekli(0.88), 180));
writeFileSync(join(pub, 'icon-192.png'), await png(kaynak, 192));
writeFileSync(join(pub, 'icon-512.png'), await png(kaynak, 512));
writeFileSync(join(pub, 'icon-maskable-512.png'), await png(olcekli(0.8), 512));

const onizleme = process.argv[2];
if (onizleme) {
  const parcalar = [];
  let x = 16;
  for (const zemin of ['#ffffff', '#202124']) {
    for (const [b, svg] of [
      [16, kaynak],
      [32, kaynak],
      [48, kaynak],
      [180, olcekli(0.88)],
      [192, kaynak],
    ]) {
      const k = b < 64 ? 4 : 1;
      const resim = await sharp(await png(svg, b))
        .resize(b * k, b * k, { kernel: 'nearest' })
        .toBuffer();
      const kutu = await sharp({
        create: { width: b * k + 32, height: 224, channels: 3, background: zemin },
      })
        .composite([{ input: resim, left: 16, top: 16 }])
        .png()
        .toBuffer();
      parcalar.push({ input: kutu, left: x, top: 16 });
      x += b * k + 40;
    }
  }
  await sharp({ create: { width: x + 8, height: 256, channels: 3, background: '#8a8a8a' } })
    .composite(parcalar)
    .png({ compressionLevel: 9 })
    .toFile(onizleme);
}
console.log('icons written');
