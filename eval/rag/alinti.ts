/**
 * Alıntı uzunluğu eşiği ölçümü (doğrulayıcı kuralı b, MIN_QUOTE_CHARS), 50 soruluk Dalga 2 setinin cevaplı
 * soruları üzerinde.
 *
 *   node eval/rag/alinti.ts          # ölçer, tabloyu yazdırır
 *   node eval/rag/alinti.ts --yaz    # ayrıca eval/rag/raporlar/alinti-esigi.{json,md} yazar
 *
 * Her soru için özete giden pasajlar (STANDARD_SELECTION) seçilir. Her pasaj gövdesinde, her kelime başından
 * başlayan ve eşiği karşılayan en kısa kelime sınırlı parça "en kısa geçerli alıntı" sayılır. Ölçülenler:
 * - genel: bu alıntı aynı istemdeki başka bir pasajın gövdesinde de geçiyor (alıntı pasaja özgü değil, iddiayı o
 *   pasaja bağlamıyor);
 * - kapsam dışı: gövdesi eşikten kısa olduğu için hiç alıntılanamayan pasaj;
 * - künye: künye satırı eşikten uzun, yani künye dışlanmasaydı tek başına alıntı olarak geçebilecek pasaj.
 * Model çağrısı yoktur; modelin gerçek alıntı uzunluğu dağılımı gerçek çıktı olmadan ölçülemez.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  normalize,
  search,
  selectPassages,
  STANDARD_SELECTION,
  type PromptPassage,
} from '../../packages/casuist/src/index.ts';
import { fixtureSearchDeps } from '../../packages/casuist/src/fixture.ts';

const NOW = new Date('2026-11-07T12:00:00Z');
const THRESHOLDS = [12, 16, 20, 24, 32];
const set = JSON.parse(readFileSync(new URL('./set-50.json', import.meta.url), 'utf8')) as {
  surum: string;
  sorular: { id: string; tur: string; soru: string }[];
};

const deps = await fixtureSearchDeps();
const prompts: PromptPassage[][] = [];
for (const s of set.sorular.filter((x) => x.tur === 'cevapli')) {
  const res = await search({ q: s.soru, pageSize: 50 }, { ...deps, now: () => NOW });
  prompts.push(await selectPassages(res.items, res.query, deps.backend, STANDARD_SELECTION));
}

/** Shortest word aligned span starting at each word with at least `min` normalised characters. */
function minimalQuotes(body: string, min: number): string[] {
  const starts = [...body.matchAll(/(?:^|\s)(\S)/g)].map((m) => (m.index ?? 0) + m[0].length - 1);
  const ends = [...body.matchAll(/\S(?=\s|$)/g)].map((m) => (m.index ?? 0) + 1);
  const out: string[] = [];
  for (const s of starts) {
    const e = ends.find((x) => x - s >= min);
    if (e !== undefined) out.push(body.slice(s, e));
  }
  return out;
}

interface Row {
  esik: number;
  alinti: number;
  genel: number;
  genelOran: number;
  kapsamDisi: number;
  kunyeYeterli: number;
  pasaj: number;
}

const rows: Row[] = THRESHOLDS.map((esik) => {
  let alinti = 0;
  let genel = 0;
  let kapsamDisi = 0;
  let kunyeYeterli = 0;
  let pasaj = 0;
  for (const ps of prompts) {
    const bodies = ps.map((p) => normalize(p.body));
    ps.forEach((p, i) => {
      pasaj++;
      const body = bodies[i] ?? '';
      if (body.length < esik) kapsamDisi++;
      if (normalize(p.text.split('\n')[0] ?? '').length >= esik) kunyeYeterli++;
      for (const q of minimalQuotes(body, esik)) {
        alinti++;
        if (bodies.some((b, j) => j !== i && b.includes(q))) genel++;
      }
    });
  }
  return { esik, alinti, genel, genelOran: genel / Math.max(1, alinti), kapsamDisi, kunyeYeterli, pasaj };
});

const kisaGovde = Math.min(...prompts.flat().map((p) => normalize(p.body).length));
const kisalar = [
  ...new Map(
    prompts
      .flat()
      .filter((p) => normalize(p.body).length < Math.max(...THRESHOLDS))
      .map((p) => [`${p.recordId}:${p.charStart}`, `${p.title}: "${p.body}"`]),
  ).values(),
];
const pct = (x: number): string => `%${(x * 100).toFixed(1)}`;
const tablo = rows
  .map(
    (r) =>
      `| ${r.esik} | ${r.alinti} | ${r.genel} (${pct(r.genelOran)}) | ${r.kapsamDisi}/${r.pasaj} | ${r.kunyeYeterli}/${r.pasaj} |`,
  )
  .join('\n');
const md = `# Alıntı uzunluğu eşiği (${NOW.toISOString().slice(0, 10)})

Set ${set.surum}, ${prompts.length} cevaplı soru, standart seçim. Komut: \`node eval/rag/alinti.ts --yaz\`.
Her pasaj gövdesinde her kelimeden başlayan en kısa geçerli alıntı denendi. En kısa pasaj gövdesi ${kisaGovde} karakter.

| Eşik (karakter) | Denenen alıntı | Aynı istemde başka pasajda da geçen | Alıntılanamayan pasaj | Künyesi tek başına yeterli pasaj |
|---|---|---|---|---|
${tablo}

Künye satırı artık alıntı denetiminin dışında (yalnız sayı denetimine girer); son sütun, dışlama olmasaydı
künyenin kendisinin kaç pasajda geçerli alıntı olabileceğini gösterir.

${Math.max(...THRESHOLDS)} karakterden kısa pasaj gövdeleri (farklı pasajlar):

${kisalar.map((k) => `- ${k}`).join('\n')}
`;
console.log(md);
if (process.argv.includes('--yaz')) {
  const dir = new URL('./raporlar/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    new URL('alinti-esigi.json', dir),
    `${JSON.stringify({ tarih: NOW.toISOString().slice(0, 10), set: set.surum, kisaGovde, rows }, null, 2)}\n`,
  );
  writeFileSync(new URL('alinti-esigi.md', dir), md);
}
