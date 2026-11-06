/**
 * Parser for docs/tespit/yazim-kurallari.md, the single source of the writing rule set.
 * The page, the download and the trace checker all read the JSON this parser produces, so the rule text
 * and the checker cannot drift apart: a test regenerates the JSON from the Markdown and compares.
 */

export type Blok =
  | { tur: 'paragraf'; metin: string }
  | {
      tur: 'madde';
      /** Unique rule id inside the whole set, "<section>.<running number>", e.g. "4.10". */
      id: string;
      /** The number printed in the source text. Section 9 restarts at 1 in its second list. */
      kaynakNo: number;
      metin: string;
    };

export interface Bolum {
  no: number;
  baslik: string;
  bloklar: Blok[];
}

export interface KuralSeti {
  surum: string;
  donem: string;
  baslik: string;
  giris: string;
  bolumler: Bolum[];
  kaynaklar: string;
  /** The complete Markdown, byte for byte, as offered for copying and download. */
  istem: string;
}

const BASLIK = /^# (.+)$/;
const BOLUM = /^## (\d+)\. (.+)$/;
const MADDE = /^(\d+)\. (.+)$/;

export function ayristir(md: string): KuralSeti {
  const satirlar = md.replace(/\r\n/g, '\n').split('\n');
  const ilk = BASLIK.exec(satirlar[0] ?? '');
  if (!ilk?.[1]) throw new Error('Rule set must start with a level one heading');
  const baslik = ilk[1];
  const sv = /sürüm ([\d.]+) · ([^)]+)\)/.exec(baslik);
  if (!sv?.[1] || !sv[2]) throw new Error('Heading must carry the version and period');

  const bolumler: Bolum[] = [];
  const girisSatirlari: string[] = [];
  let kaynaklar = '';
  let bolum: Bolum | undefined;
  let sayac = 0;
  let paragraf: string[] = [];

  const paragrafiKapat = () => {
    const metin = paragraf.join(' ').trim();
    paragraf = [];
    if (!metin) return;
    if (bolum) bolum.bloklar.push({ tur: 'paragraf', metin });
    else girisSatirlari.push(metin);
  };

  for (const satir of satirlar.slice(1)) {
    const b = BOLUM.exec(satir);
    if (b?.[1] && b[2]) {
      paragrafiKapat();
      bolum = { no: Number(b[1]), baslik: b[2], bloklar: [] };
      bolumler.push(bolum);
      sayac = 0;
      continue;
    }
    if (satir === '---') {
      paragrafiKapat();
      bolum = undefined;
      continue;
    }
    if (!bolum) {
      if (satir.startsWith('Kaynaklar:')) kaynaklar = satir;
      else if (satir.trim()) paragraf.push(satir.trim());
      continue;
    }
    const m = MADDE.exec(satir);
    if (m?.[1] && m[2]) {
      paragrafiKapat();
      sayac += 1;
      bolum.bloklar.push({
        tur: 'madde',
        id: `${bolum.no}.${sayac}`,
        kaynakNo: Number(m[1]),
        metin: m[2],
      });
      continue;
    }
    if (!satir.trim()) {
      paragrafiKapat();
      continue;
    }
    paragraf.push(satir.trim());
  }
  paragrafiKapat();
  if (!kaynaklar) throw new Error('Source footer is missing');

  return {
    surum: sv[1],
    donem: sv[2],
    baslik: baslik.replace(/ \(.*\)$/, ''),
    giris: girisSatirlari.join('\n\n'),
    bolumler,
    kaynaklar,
    istem: md.endsWith('\n') ? md : `${md}\n`,
  };
}

export const maddeler = (k: KuralSeti) =>
  k.bolumler.flatMap((b) => b.bloklar.flatMap((x) => (x.tur === 'madde' ? [x] : [])));
