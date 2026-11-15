/**
 * Hibrit getirme ölçümü (plan 7.2): embedding adaylarının vektör kolu, packages/casuist search() içinde tam
 * metin ve kimlik koluyla RRF (k=60) üzerinden birleştiğinde ne kazandırıyor?
 *
 *   uv run --extra ner-runtime python -I ../../eval/embed/olc.py --vektor <klasör>   # services/worker-py içinden
 *   node eval/embed/hibrit.ts <klasör>            # özeti yazdırır
 *   node eval/embed/hibrit.ts <klasör> --yaz      # eval/embed/raporlar/dalga-2-hibrit.{json,md}
 *
 * Model çağrısı yapmaz: olc.py'nin yazdığı vektörleri metne göre bulan bir Embedder kullanır. Karşılaştırma
 * satırları: vektörsüz (yalnız tam metin ve kimlik), fikstürün karakter üçlüsü vektörü (bugünkü durum) ve her
 * aday için iki pasaj biçimi (metin: üretimdeki embed.chunks; baslik+metin: MemoryBackend). minSimilarity 0'dır
 * (KAZUIST_EMBED_ESIK öntanımı); üçlü vektör fikstürdeki 0,3 eşiğiyle çalışır.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryBackend, search, type Embedder, type SearchDeps } from '../../packages/casuist/src/index.ts';
import { fixtureRecords, fixtureSearchDeps, FIXTURE_VERSION } from '../../packages/casuist/src/fixture.ts';

interface Soru {
  id: string;
  tur: string;
  soru: string;
  beklenen: string[];
}
interface Vektorler {
  model: string;
  owners: string[];
  passages: Record<'metin' | 'baslik+metin', number[][]>;
  texts: Record<'metin' | 'baslik+metin', string[]>;
  queries: Record<string, number[]>;
}

const dir = process.argv[2];
if (!dir || dir.startsWith('--'))
  throw new Error('kullanım: node eval/embed/hibrit.ts <vektör klasörü> [--yaz]');
const NOW = new Date('2026-11-14T12:00:00Z');
const read = <T>(rel: string): T => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as T;
const sets: Record<string, { derlem: string; sorular: Soru[] }> = {
  'rag-50': read('../rag/set-50.json'),
  sentetik: read('./set-sentetik.json'),
};
for (const [name, s] of Object.entries(sets))
  if (s.derlem !== FIXTURE_VERSION) throw new Error(`${name}: set ${s.derlem}, fikstür ${FIXTURE_VERSION}`);

const keyOf = new Map(
  read<{ kayitlar: { id: string; sourceKey: string }[] }>(
    '../../packages/casuist/fixtures/kayitlar.json',
  ).kayitlar.map((r) => [r.id, r.sourceKey]),
);

/** Looks vectors up by text; passages arrive as "<title>\n<chunk>" from MemoryBackend.index. */
function lookupEmbedder(v: Vektorler, form: 'metin' | 'baslik+metin'): Embedder {
  const index = new Map(v.texts['baslik+metin'].map((t, i) => [t, i]));
  const queries = new Map<string, number[]>();
  for (const [name, s] of Object.entries(sets))
    for (const q of s.sorular) {
      const vec = v.queries[`${name}/${q.id}`];
      if (vec) queries.set(q.soru, vec);
    }
  return {
    model: `${v.model}|${form}`,
    dimensions: 1024,
    embed: async (texts, kind) =>
      texts.map((t) => {
        const vec = kind === 'query' ? queries.get(t) : v.passages[form][index.get(t) ?? -1];
        if (!vec) throw new Error(`vektör yok: ${kind}`);
        return vec;
      }),
  };
}

const log2 = (x: number): number => Math.log(x) / Math.LN2;
function scores(ranked: string[], relevant: string[]) {
  const rel = new Set(relevant);
  const first = ranked.findIndex((k) => rel.has(k));
  const ideal = Array.from({ length: Math.min(rel.size, 10) }, (_, i) => 1 / log2(i + 2)).reduce(
    (a, b) => a + b,
    0,
  );
  const dcg = ranked.slice(0, 10).reduce((s, k, i) => s + (rel.has(k) ? 1 / log2(i + 2) : 0), 0);
  return {
    h1: first === 0 ? 1 : 0,
    h5: first >= 0 && first < 5 ? 1 : 0,
    h10: first >= 0 && first < 10 ? 1 : 0,
    ndcg: ideal ? dcg / ideal : 0,
    mrr: first >= 0 && first < 10 ? 1 / (first + 1) : 0,
  };
}

async function measure(label: string, deps: SearchDeps) {
  const out: Record<string, unknown> = { satir: label };
  for (const [name, s] of Object.entries(sets)) {
    const rows: ReturnType<typeof scores>[] = [];
    const misses: string[] = [];
    let unansweredHigh = 0;
    let unanswered = 0;
    for (const q of s.sorular) {
      const res = await search({ q: q.soru, pageSize: 10 }, { ...deps, now: () => NOW });
      const ranked = res.items.map((r) => keyOf.get(r.record.id) ?? '');
      if (!q.beklenen.length) {
        unanswered++;
        if (res.items[0]?.labels.includes('ilgililik_yuksek')) unansweredHigh++;
        continue;
      }
      const sc = scores(ranked, q.beklenen);
      if (!sc.h10) misses.push(q.id);
      rows.push(sc);
    }
    const avg = (f: (r: ReturnType<typeof scores>) => number) =>
      Number((rows.reduce((a, r) => a + f(r), 0) / Math.max(1, rows.length)).toFixed(4));
    out[name] = {
      sorular: rows.length,
      'isabet@1': avg((r) => r.h1),
      'isabet@5': avg((r) => r.h5),
      'isabet@10': avg((r) => r.h10),
      'ndcg@10': avg((r) => r.ndcg),
      'mrr@10': avg((r) => r.mrr),
      kacanlarIlk10: misses,
      cevapsizUstYuksek: `${unansweredHigh}/${unanswered}`,
    };
  }
  return out;
}

const satirlar: Record<string, unknown>[] = [];
const fixture = await fixtureSearchDeps();
satirlar.push(await measure('vektörsüz (tam metin ve kimlik)', { backend: fixture.backend, embedder: null }));
satirlar.push(await measure('karakter üçlüsü (fikstür, eşik 0,3)', fixture));
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  const v = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Vektorler;
  for (const form of ['metin', 'baslik+metin'] as const) {
    const embedder = lookupEmbedder(v, form);
    const backend = await new MemoryBackend(fixtureRecords()).index(embedder);
    satirlar.push(
      await measure(`${file.replace(/\.json$/, '')} ${form}`, { backend, embedder, minSimilarity: 0 }),
    );
  }
}

type Ozet = Record<'isabet@1' | 'isabet@10' | 'ndcg@10' | 'mrr@10', number> & { cevapsizUstYuksek: string };
const pct = (x: number): string => `%${(x * 100).toFixed(1)}`;
const tablo = satirlar
  .map((r) => {
    const s = r.sentetik as Ozet;
    const g = r['rag-50'] as Ozet;
    return `| ${String(r.satir)} | ${pct(s['isabet@1'])} | ${pct(s['isabet@10'])} | ${s['ndcg@10'].toFixed(3)} | ${pct(g['isabet@1'])} | ${pct(g['isabet@10'])} | ${g['ndcg@10'].toFixed(3)} | ${g.cevapsizUstYuksek} |`;
  })
  .join('\n');
const md = `# Hibrit getirme ölçümü, Dalga 2 (${NOW.toISOString().slice(0, 10)})

Komut: \`node eval/embed/hibrit.ts <vektör klasörü> --yaz\` (vektörler \`eval/embed/olc.py --vektor\` ile).
Derlem ${FIXTURE_VERSION}; packages/casuist \`search()\` bellek arka ucuyla, ilk 10 sonuç. Vektör kolu
tam metin koluyla RRF (k=60) üzerinden birleşir; ilgililik ve sıralama üretimdeki kodla aynıdır.
Son sütun: cevapsız sorularda ilk sonucun "Yüksek ilgililik" etiketi alma sayısı (düşük olmalı).

| Satır | Sentetik isabet@1 | Sentetik isabet@10 | Sentetik nDCG@10 | rag-50 isabet@1 | rag-50 isabet@10 | rag-50 nDCG@10 | Cevapsızda Yüksek |
|---|---|---|---|---|---|---|---|
${tablo}

Ayrıntı (kaçan sorular): dalga-2-hibrit.json.
`;
console.log(md);
if (process.argv.includes('--yaz')) {
  const out = new URL('./raporlar/', import.meta.url);
  writeFileSync(
    new URL('dalga-2-hibrit.json', out),
    `${JSON.stringify({ tarih: NOW.toISOString().slice(0, 10), satirlar }, null, 2)}\n`,
  );
  writeFileSync(new URL('dalga-2-hibrit.md', out), md);
}
