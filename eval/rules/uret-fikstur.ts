/**
 * Rebuilds the DOCX fixtures of services/worker-py/docxcheck/tests/fixtures from the template builder.
 *
 *   node eval/rules/uret-fikstur.ts
 *
 * Three rule sets with different margins, fonts, sizes, spacing and page number positions stand in for the
 * three institute guides of plan 15.3/3 until approved institute profiles exist (they are synthetic, they are
 * not any institute's rules).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sablonUret } from '../../apps/web/src/app/yazma/_cekirdek/docx-uret.ts';
import {
  ornekKayit,
  type KuralDegerleri,
  type SablonTuru,
} from '../../apps/web/src/app/yazma/_cekirdek/kural-semasi.ts';

const hedef = fileURLToPath(new URL('../../services/worker-py/docxcheck/tests/fixtures/', import.meta.url));
mkdirSync(hedef, { recursive: true });

export const sentetikKurallar: { ad: string; tur: SablonTuru; degisiklik: Partial<KuralDegerleri> }[] = [
  { ad: 'tez', tur: 'tez', degisiklik: {} },
  { ad: 'makale', tur: 'makale', degisiklik: {} },
  {
    ad: 'tez-ust-sag',
    tur: 'tez',
    degisiklik: {
      font: 'Arial',
      size: 11,
      line: 1.15,
      indent: 1,
      spAfter: 0,
      mTop: 2.5,
      mBottom: 2.5,
      mLeft: 3,
      mRight: 2,
      pageNum: 'ust-sag',
      frontRoman: false,
      h1Size: 13,
      h1Upper: false,
      h2Size: 12,
      h3Size: 11,
      footSize: 9,
    },
  },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const { ad, tur, degisiklik } of sentetikKurallar) {
    const kayit = ornekKayit(tur);
    const buf = await sablonUret({ ...kayit.degerler, ...degisiklik }, tur);
    writeFileSync(`${hedef}${ad}.docx`, buf);
    console.log(`${ad}.docx ${buf.length} bayt`);
  }
}
