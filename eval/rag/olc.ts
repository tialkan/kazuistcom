/**
 * Kaynaklı özet ölçümü (plan 6.7 ve 7.6), 50 soruluk Dalga 2 seti.
 *
 *   node eval/rag/olc.ts            # ölçer, özeti yazdırır
 *   node eval/rag/olc.ts --yaz      # ayrıca eval/rag/raporlar/ altına JSON ve Markdown rapor yazar
 *
 * Gerçek model çağrısı yapmaz. Modele bağlı eşikler (uydurma kaynak oranının uçtan uca ölçümü, çekimserlik,
 * desteksiz cümle, ilk doğrulanmış cümle süresi, kişi adı sızıntısı) gerçek corpus ve model olmadan
 * "ölçülmedi" yazılır ve geçti sayılmaz. Ölçülen: getirme (ilk 10'da beklenen kaynak), arama süresi (fikstür
 * belleğinde) ve doğrulayıcının saldırgan satırlara karşı davranışı.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  createLineValidator,
  search,
  selectPassages,
  STANDARD_SELECTION,
  type PromptPassage,
} from '../../packages/casuist/src/index.ts';
import { fixtureSearchDeps, FIXTURE_VERSION } from '../../packages/casuist/src/fixture.ts';

interface Soru {
  id: string;
  tur: 'cevapli' | 'cevapsiz' | 'tuzak';
  soru: string;
  beklenen: string[];
  not?: string;
}
interface Set {
  surum: string;
  derlem: string;
  sorular: Soru[];
}

const NOW = new Date('2026-11-07T12:00:00Z');
const set = JSON.parse(readFileSync(new URL('./set-50.json', import.meta.url), 'utf8')) as Set;
const raw = JSON.parse(
  readFileSync(new URL('../../packages/casuist/fixtures/kayitlar.json', import.meta.url), 'utf8'),
) as { kayitlar: { id: string; sourceKey: string }[] };
const idOf = new Map(raw.kayitlar.map((r) => [r.sourceKey, r.id]));

if (set.sorular.length !== 50) throw new Error(`set 50 soru olmalı, ${set.sorular.length} var`);
if (set.derlem !== FIXTURE_VERSION)
  throw new Error(`set ${set.derlem} derlemi için, fikstür ${FIXTURE_VERSION}`);
for (const s of set.sorular)
  for (const k of s.beklenen) if (!idOf.has(k)) throw new Error(`${s.id}: ${k} derlemde yok`);

const deps = await fixtureSearchDeps();
const p = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] ?? 0;
};

// 1. Getirme: beklenen kaynaklardan en az biri ilk 10'da (cevaplı ve beklenen kaynağı olan tuzak sorular).
const sureler: number[] = [];
const getirme: { id: string; tur: string; isabet: boolean; sira: number | null }[] = [];
const cevapsizUst: { id: string; ustIlgililik: number; ustEtiket: string | null }[] = [];
const passagesFor = new Map<string, PromptPassage[]>();
for (const s of set.sorular) {
  const t0 = performance.now();
  const res = await search({ q: s.soru, pageSize: 10 }, { ...deps, now: () => NOW });
  sureler.push(performance.now() - t0);
  const ids = res.items.map((r) => r.record.id);
  if (s.beklenen.length) {
    const want = new Set(s.beklenen.map((k) => idOf.get(k)));
    const sira = ids.findIndex((id) => want.has(id));
    getirme.push({ id: s.id, tur: s.tur, isabet: sira >= 0, sira: sira >= 0 ? sira + 1 : null });
  } else {
    const ust = res.items[0];
    cevapsizUst.push({
      id: s.id,
      ustIlgililik: Number((ust?.relevance ?? 0).toFixed(3)),
      ustEtiket: ust?.labels.find((l) => l.startsWith('ilgililik_')) ?? null,
    });
  }
  if (s.tur === 'cevapli') {
    const full = await search({ q: s.soru, pageSize: 50 }, { ...deps, now: () => NOW });
    passagesFor.set(s.id, await selectPassages(full.items, full.query, deps.backend, STANDARD_SELECTION));
  }
}
const cevapli = getirme.filter((g) => g.tur === 'cevapli');
const recall10 = cevapli.filter((g) => g.isabet).length / cevapli.length;

// 2. Doğrulayıcı: her cevaplı soru için saldırgan satırlar; hiçbiri gösterilmemeli. Birebir alıntılı satır geçmeli.
const saldiri = { uydurmaKimlik: 0, sahteAlinti: 0, dayanaksizSayi: 0, kisiAdi: 0, toplam: 0 };
let birebirKabul = 0;
let birebirToplam = 0;
for (const [, ps] of passagesFor) {
  const k1 = ps[0];
  if (!k1) continue;
  const body = k1.text.split('\n').slice(1).join(' ');
  const quote = body.split(/\s+/).slice(0, 8).join(' ');
  const line = (o: Record<string, unknown>): string =>
    JSON.stringify({ t: 'cumle', metin: quote, kaynaklar: [k1.id], alinti: { [k1.id]: quote }, ...o });
  const run = async (raw: string): Promise<boolean> =>
    (await createLineValidator(ps, { now: NOW }).check(raw)).ok;
  birebirToplam++;
  if (await run(line({}))) birebirKabul++;
  const attacks: [keyof typeof saldiri, string][] = [
    ['uydurmaKimlik', line({ kaynaklar: ['K99'], alinti: { K99: quote } })],
    ['sahteAlinti', line({ alinti: { [k1.id]: `${quote} ve bu ek cümle kaynakta yoktur` } })],
    ['dayanaksizSayi', line({ metin: `${quote} 9876 sayılı kararla 31.12.1999 tarihinde değişti.` })],
    ['kisiAdi', line({ metin: `Av. Mehmet Yılmaz ${quote}` })],
  ];
  for (const [kind, rawLine] of attacks) {
    saldiri.toplam++;
    if (await run(rawLine)) saldiri[kind]++;
  }
}

type Durum = 'gecti' | 'gecmedi' | 'olculmedi';
const satir = (olcut: string, esik: string, deger: string, durum: Durum, not: string) => ({
  olcut,
  esik,
  deger,
  durum,
  not,
});
const rapor = {
  tarih: NOW.toISOString().slice(0, 10),
  set: set.surum,
  derlem: set.derlem,
  soruSayisi: {
    toplam: set.sorular.length,
    cevapli: cevapli.length,
    cevapsiz: cevapsizUst.length,
    tuzak: set.sorular.filter((s) => s.tur === 'tuzak').length,
  },
  esikler: [
    satir(
      'Uydurma kaynak (dizinde olmayan kimlik)',
      '0',
      `doğrulayıcı ${saldiri.uydurmaKimlik}/${passagesFor.size} saldırgan satırı geçirdi`,
      'olculmedi',
      'Doğrulayıcı kuralı (a) dizinde olmayan kimliği hiçbir zaman göstermez; gerçek modelle uçtan uca ölçüm yapılmadı.',
    ),
    satir(
      'Desteksiz cümle oranı (insan değerlendirmesi)',
      '%1 altı (200 soru)',
      'yok',
      'olculmedi',
      'İnsan değerlendirmesi ve gerçek model çıktısı gerekir.',
    ),
    satir(
      'Cevapsız sorularda doğru çekimserlik',
      '%90 ve üstü',
      'yok',
      'olculmedi',
      'Model çıktısı gerekir; getirmenin cevapsız sorulardaki en üst ilgililiği aşağıda bilgi olarak verildi.',
    ),
    satir(
      "Beklenen kaynaklardan en az biri ilk 10'da",
      '%85 ve üstü',
      `%${(recall10 * 100).toFixed(1)} (${cevapli.filter((g) => g.isabet).length}/${cevapli.length})`,
      recall10 >= 0.85 ? 'gecti' : 'gecmedi',
      'Yalnız 75 kayıtlık fikstür derleminde ve karakter üçlüsü vektörüyle; gerçek corpus ve embedding modeliyle yeniden ölçülmeli.',
    ),
    satir(
      'Arama p95',
      '1,5 sn ve altı',
      `${p(sureler, 0.95).toFixed(1)} ms (p50 ${p(sureler, 0.5).toFixed(1)} ms)`,
      'olculmedi',
      'Bellek içi fikstür süresidir; PostgreSQL, embedding servisi ve 200 eşzamanlı istekle (k6) ölçülmedi.',
    ),
    satir(
      'İlk doğrulanmış cümle p95',
      '3 sn ve altı',
      'yok',
      'olculmedi',
      'Gerçek sağlayıcıyla akış ölçümü yapılmadı.',
    ),
    satir(
      'Kişi adı sızıntısı',
      '0',
      `doğrulayıcı ${saldiri.kisiAdi}/${passagesFor.size} saldırgan satırı geçirdi`,
      'olculmedi',
      'Kural tabanlı ad denetimi saldırgan satırları durdurdu; NER bağlanmadı ve gerçek modelle ölçülmedi.',
    ),
  ],
  getirme,
  cevapsizUst,
  dogrulayici: { saldiri, birebirKabul, birebirToplam },
  aramaSureleriMs: { p50: p(sureler, 0.5), p95: p(sureler, 0.95), en: Math.max(...sureler) },
};

const tablo = rapor.esikler
  .map(
    (e) =>
      `| ${e.olcut} | ${e.esik} | ${e.deger} | ${e.durum === 'gecti' ? 'geçti' : e.durum === 'gecmedi' ? 'geçmedi' : 'ölçülmedi'} | ${e.not} |`,
  )
  .join('\n');
const kacan = getirme.filter((g) => !g.isabet).map((g) => g.id);
const md = `# Kaynaklı özet ölçümü, Dalga 2 (${rapor.tarih})

Set ${rapor.set}; derlem ${rapor.derlem} (75 kayıt). Komut: \`node eval/rag/olc.ts --yaz\`.
Sorular: ${rapor.soruSayisi.cevapli} cevaplı, ${rapor.soruSayisi.cevapsiz} cevapsız (beklenen kaynağı olmayan tuzak dahil), ${rapor.soruSayisi.tuzak} tuzak.

Gerçek corpus ve gerçek model olmadan ölçülemeyen her eşik "ölçülmedi" yazıldı ve geçti sayılmadı (CLAUDE.md bitti tanımı).

| Ölçüt | Eşik | Değer | Durum | Not |
|---|---|---|---|---|
${tablo}

## Getirme

İlk 10'da kaçan sorular: ${kacan.length ? kacan.join(', ') : 'yok'}.

## Doğrulayıcı saldırı satırları

Her cevaplı soru için en ilgili pasajdan birebir alıntılı bir satır ve dört saldırgan satır denendi.
Birebir alıntılı satır kabulü: ${birebirKabul}/${birebirToplam}. Saldırgan satırlardan gösterilen: uydurma kimlik ${saldiri.uydurmaKimlik},
sahte alıntı ${saldiri.sahteAlinti}, dayanaksız sayı ${saldiri.dayanaksizSayi}, kişi adı ${saldiri.kisiAdi} (toplam ${saldiri.toplam} satır).

## Cevapsız sorularda getirmenin en üst sonucu

${cevapsizUst.map((c) => `- ${c.id}: ilgililik ${c.ustIlgililik} (${c.ustEtiket ?? 'sonuç yok'})`).join('\n')}

Etiketleme casuist ajanınındır; hukukçu editör teyidi bekliyor.
`;

console.log(md);
if (process.argv.includes('--yaz')) {
  const dir = new URL('./raporlar/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('dalga-2-fikstur.json', dir), `${JSON.stringify(rapor, null, 2)}\n`);
  writeFileSync(new URL('dalga-2-fikstur.md', dir), md);
}
const olculenGecmedi = rapor.esikler.some((e) => e.durum === 'gecmedi');
const dogrulayiciAcik =
  saldiri.uydurmaKimlik + saldiri.sahteAlinti + saldiri.dayanaksizSayi + saldiri.kisiAdi > 0;
process.exit(olculenGecmedi || dogrulayiciAcik || birebirKabul !== birebirToplam ? 1 : 0);
