/**
 * Measurement of plan 15.3/3 ("Kural çıkarma, 10 kılavuz"):
 *   - core fields (margins, font, size, line spacing, page number, citation system) at 95 percent or more;
 *   - a faultless DOCX from 3 guides.
 *
 *   node eval/rules/olc.ts                 # --mod=oracle (default): the gold answers stand in for the model
 *   node eval/rules/olc.ts --mod=canli     # real model through the gateway binding (needs YAZMA_YZ=acik and a key)
 *
 * The oracle mode checks everything except the model: that the gold labels are verbatim in the guides, that the
 * pipeline accepts them, and that the DOCX built from them passes docxcheck and LibreOffice. It says nothing about
 * model accuracy, so it never passes the accuracy criterion. A criterion without data counts as failed.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sablonUret } from '../../apps/web/src/app/yazma/_cekirdek/docx-uret.ts';
import {
  alintiyiBul,
  degerAlintidaVarMi,
  kuralCikar,
  normallestir,
  type KuralModeli,
} from '../../apps/web/src/app/yazma/_cekirdek/kural-cikarma.ts';
import {
  cekirdekAlanlar,
  ornekKayit,
  type KuralAnahtari,
  type KuralDegerleri,
  type SablonTuru,
} from '../../apps/web/src/app/yazma/_cekirdek/kural-semasi.ts';
import { sentetikKurallar } from './uret-fikstur.ts';

const kok = fileURLToPath(new URL('../../', import.meta.url));
const klasor = (ad: string) => fileURLToPath(new URL(`./${ad}/`, import.meta.url));
const ESIK = 0.95;
const GEREKEN_KILAVUZ = 10;
const GEREKEN_DOCX = 3;

interface AltinAlan {
  deger?: unknown;
  anahtar?: string;
  alinti: string;
}
interface Altin {
  kilavuz: string;
  dergi: string;
  tur: SablonTuru;
  alanlar: Partial<Record<KuralAnahtari, AltinAlan>>;
  bos: KuralAnahtari[];
}

const mod = (process.argv.find((a) => a.startsWith('--mod='))?.slice(6) ?? 'oracle') as 'oracle' | 'canli';

const kilavuzMetni = (ad: string) =>
  readFileSync(`${klasor('kilavuz')}${ad}.txt`, 'utf8')
    .split('\n')
    .filter((s) => !s.startsWith('# '))
    .join('\n')
    .trim();

function altinlariYukle(): Altin[] {
  return readdirSync(klasor('altin'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(`${klasor('altin')}${f}`, 'utf8')) as Altin);
}

/** The gold answer in the model's answer format. */
function oracleModeli(a: Altin): KuralModeli {
  const alanlar: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a.alanlar) as [KuralAnahtari, AltinAlan][]) {
    const deger =
      k === 'citation'
        ? v.anahtar === 'chicago'
          ? 'Chicago 18. baskı (dipnotlu)'
          : 'OSCOLA 4. Edisyon'
        : v.deger;
    alanlar[k] = { deger, sayfa: null, alinti: v.alinti };
  }
  return { tamamla: async () => JSON.stringify({ alanlar }) };
}

async function canliModel(): Promise<KuralModeli> {
  const { kuralModeli } = await import('../../apps/web/src/app/yazma/_sunucu/yz.ts');
  const m = kuralModeli(process.env);
  if (!m) throw new Error('YAZMA_YZ=acik ve OPENROUTER_API_KEY olmadan --mod=canli çalışmaz');
  return m;
}

const esit = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number'
    ? Math.abs(a - b) < 0.011
    : JSON.stringify(a) === JSON.stringify(b);

interface KilavuzSonucu {
  kilavuz: string;
  dergi: string;
  altinAlintiBulundu: { anahtar: string; bulundu: boolean; degerAlintida: boolean }[];
  dogru: string[];
  yanlis: { anahtar: string; beklenen: unknown; bulunan: unknown; kaynak: string }[];
  bosDogru: string[];
  bosYanlis: string[];
  cekirdek: { dogru: number; toplam: number };
  tum: { dogru: number; toplam: number };
  sonnetYedegi: boolean;
}

async function kilavuzOlc(a: Altin, model: KuralModeli): Promise<KilavuzSonucu> {
  const metin = kilavuzMetni(a.kilavuz);
  const sayfalar = [{ sayfa: null, metin }];
  const normaller = [normallestir(metin)];
  // Gold validity: every gold quote is in the guide, and says the value.
  const altinAlinti = (Object.entries(a.alanlar) as [KuralAnahtari, AltinAlan][]).map(([k, v]) => {
    const b = alintiyiBul(sayfalar, normaller, v.alinti, null);
    return {
      anahtar: k,
      bulundu: b !== null,
      degerAlintida: k === 'citation' || (b !== null && degerAlintidaVarMi(k, v.deger, b.alinti)),
    };
  });
  const sonuc = await kuralCikar(sayfalar, a.tur, model);
  const dogru: string[] = [];
  const yanlis: KilavuzSonucu['yanlis'] = [];
  for (const [k, v] of Object.entries(a.alanlar) as [KuralAnahtari, AltinAlan][]) {
    const bulunan = sonuc.kayit.degerler[k];
    const kaynak = sonuc.kayit.kaynaklar[k];
    const tamam =
      kaynak === 'kilavuz' &&
      (k === 'citation'
        ? String(bulunan)
            .toLocaleLowerCase('tr-TR')
            .includes(v.anahtar ?? '\u0000')
        : esit(bulunan, v.deger));
    if (tamam) dogru.push(k);
    else yanlis.push({ anahtar: k, beklenen: k === 'citation' ? v.anahtar : v.deger, bulunan, kaynak });
  }
  const bosDogru = a.bos.filter((k) => sonuc.kayit.kaynaklar[k] === 'ornek');
  const bosYanlis = a.bos.filter((k) => sonuc.kayit.kaynaklar[k] !== 'ornek');
  const cek = new Set<string>(cekirdekAlanlar);
  const sayim = (liste: string[]) => liste.filter((k) => cek.has(k)).length;
  const cekirdekToplam = [...Object.keys(a.alanlar), ...a.bos].filter((k) => cek.has(k)).length;
  return {
    kilavuz: a.kilavuz,
    dergi: a.dergi,
    altinAlintiBulundu: altinAlinti,
    dogru,
    yanlis,
    bosDogru,
    bosYanlis,
    cekirdek: { dogru: sayim(dogru) + sayim(bosDogru), toplam: cekirdekToplam },
    tum: { dogru: dogru.length + bosDogru.length, toplam: Object.keys(a.alanlar).length + a.bos.length },
    sonnetYedegi: sonuc.sonnetYedegi,
  };
}

// ---- DOCX built from the gold rules, checked by services/worker-py/docxcheck ------------------------------------

interface DocxSonucu {
  ad: string;
  tur: SablonTuru;
  kaynak: 'kilavuz-altin' | 'sentetik';
  hatasiz: boolean;
  uyumsuz: string[];
  libreOffice: { varMi: boolean; ok: boolean; sayfa?: number; sorunlar?: string[] };
}

function docxKontrol(
  ad: string,
  tur: SablonTuru,
  degerler: KuralDegerleri,
  bayt: Uint8Array,
  kaynak: DocxSonucu['kaynak'],
): DocxSonucu {
  const klasorYolu = join(tmpdir(), `kazuist-olc-${process.pid}`);
  mkdirSync(klasorYolu, { recursive: true });
  const docx = join(klasorYolu, `${ad}.docx`);
  const kurallar = join(klasorYolu, `${ad}.json`);
  writeFileSync(docx, bayt);
  writeFileSync(kurallar, JSON.stringify(degerler));
  let cikti: string;
  let kod = 0;
  try {
    cikti = execFileSync(
      'uv',
      ['run', 'python', '-m', 'docxcheck', docx, '--kind', tur, '--rules', kurallar, '--libreoffice'],
      { cwd: join(kok, 'services/worker-py'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    kod = err.status ?? 2;
    cikti = err.stdout ?? '';
  }
  let j: {
    report?: { findings: { key: string; status: string }[] };
    libreoffice?: { available: boolean; ok?: boolean; pages?: number; problems?: string[] };
  } = {};
  try {
    j = JSON.parse(cikti);
  } catch {
    /* unreadable output counts as a failure below */
  }
  const uyumsuz = (j.report?.findings ?? []).filter((f) => f.status === 'uyumsuz').map((f) => f.key);
  const lo = j.libreoffice;
  return {
    ad,
    tur,
    kaynak,
    hatasiz: kod === 0 && uyumsuz.length === 0 && lo?.ok === true,
    uyumsuz,
    libreOffice: {
      varMi: lo?.available === true,
      ok: lo?.ok === true,
      ...(lo?.pages ? { sayfa: lo.pages } : {}),
      ...(lo?.problems ? { sorunlar: lo.problems } : {}),
    },
  };
}

async function docxOlc(altinlar: Altin[]): Promise<DocxSonucu[]> {
  const sonuclar: DocxSonucu[] = [];
  for (const a of altinlar) {
    const kayit = ornekKayit(a.tur);
    for (const [k, v] of Object.entries(a.alanlar) as [KuralAnahtari, AltinAlan][])
      if (k !== 'citation') (kayit.degerler as unknown as Record<string, unknown>)[k] = v.deger;
    kayit.degerler.institution = a.dergi;
    sonuclar.push(
      docxKontrol(a.kilavuz, a.tur, kayit.degerler, await sablonUret(kayit.degerler, a.tur), 'kilavuz-altin'),
    );
  }
  for (const s of sentetikKurallar) {
    const kayit = ornekKayit(s.tur);
    const degerler = { ...kayit.degerler, ...s.degisiklik };
    sonuclar.push(
      docxKontrol(`sentetik-${s.ad}`, s.tur, degerler, await sablonUret(degerler, s.tur), 'sentetik'),
    );
  }
  return sonuclar;
}

// ---- Report -------------------------------------------------------------------------------------------------------------

const oran = (d: number, t: number) => (t ? d / t : 0);
const yuzde = (x: number) => `%${(x * 100).toFixed(1).replace('.', ',')}`;

const altinlar = altinlariYukle();
const canli = mod === 'canli' ? await canliModel() : null;
const sonuclar: KilavuzSonucu[] = [];
for (const a of altinlar) sonuclar.push(await kilavuzOlc(a, canli ?? oracleModeli(a)));
const docxler = await docxOlc(altinlar);

const cekDogru = sonuclar.reduce((n, s) => n + s.cekirdek.dogru, 0);
const cekToplam = sonuclar.reduce((n, s) => n + s.cekirdek.toplam, 0);
const tumDogru = sonuclar.reduce((n, s) => n + s.tum.dogru, 0);
const tumToplam = sonuclar.reduce((n, s) => n + s.tum.toplam, 0);
const altinGecerli = sonuclar.every((s) => s.altinAlintiBulundu.every((x) => x.bulundu && x.degerAlintida));
const hatasizDocx = docxler.filter((d) => d.hatasiz);

const olcutler = {
  cekirdekDogruluk: {
    esik: ESIK,
    olculen: oran(cekDogru, cekToplam),
    kilavuzSayisi: sonuclar.length,
    gerekenKilavuz: GEREKEN_KILAVUZ,
    model: mod,
    gecti: mod === 'canli' && sonuclar.length >= GEREKEN_KILAVUZ && oran(cekDogru, cekToplam) >= ESIK,
    neden:
      mod !== 'canli'
        ? 'Model ölçümü yapılmadı: oracle kipi yalnız hattı ve altın etiketleri sınar.'
        : sonuclar.length < GEREKEN_KILAVUZ
          ? `${sonuclar.length} kılavuz var, ${GEREKEN_KILAVUZ} gerekir.`
          : null,
  },
  hatasizDocx: {
    gereken: GEREKEN_DOCX,
    hatasiz: hatasizDocx.length,
    kilavuzdanHatasiz: hatasizDocx.filter((d) => d.kaynak === 'kilavuz-altin').length,
    gecti: hatasizDocx.filter((d) => d.kaynak === 'kilavuz-altin').length >= GEREKEN_DOCX,
    neden: docxler.some((d) => !d.libreOffice.varMi)
      ? 'LibreOffice (soffice) bulunamadı; ölçülemeyen kayıt geçmedi sayıldı.'
      : null,
  },
};

const rapor = {
  tarih: new Date().toISOString(),
  kip: mod,
  uyari:
    mod === 'oracle'
      ? 'Oracle kipi: model cevabı yerine altın etiketler kullanıldı. Doğruluk yüzdesi modelin değil hattın ve etiketlerin tutarlılığını gösterir.'
      : 'Canlı model ölçümü.',
  kilavuzlar: sonuclar,
  altinEtiketlerKilavuzdaBirebir: altinGecerli,
  toplam: {
    cekirdek: { dogru: cekDogru, toplam: cekToplam, oran: oran(cekDogru, cekToplam) },
    tum: { dogru: tumDogru, toplam: tumToplam, oran: oran(tumDogru, tumToplam) },
  },
  docx: docxler,
  olcutler,
};

const gun = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(rapor.tarih));
mkdirSync(klasor('raporlar'), { recursive: true });
writeFileSync(`${klasor('raporlar')}${gun}-${mod}.json`, `${JSON.stringify(rapor, null, 2)}\n`);

const md: string[] = [
  `# Kural çıkarma ölçümü, ${gun}, kip: ${mod}`,
  '',
  `> ${rapor.uyari}`,
  '',
  `Kılavuz sayısı: ${sonuclar.length} (plan 15.3/3 için ${GEREKEN_KILAVUZ} gerekir). Kaynak: DergiPark dergi yazım kuralları sayfaları, 2026-11-07; altın etiketleri yazma ajanı yazdı, editör doğrulaması bekliyor.`,
  '',
  '## Alan doğruluğu',
  '',
  '| Kılavuz | Çekirdek alan | Tüm alanlar | Yanlış | Gereksiz iddia |',
  '|---|---|---|---|---|',
  ...sonuclar.map(
    (s) =>
      `| ${s.kilavuz} | ${s.cekirdek.dogru}/${s.cekirdek.toplam} | ${s.tum.dogru}/${s.tum.toplam} | ${s.yanlis.map((y) => y.anahtar).join(', ') || '-'} | ${s.bosYanlis.join(', ') || '-'} |`,
  ),
  '',
  `Çekirdek alanlarda toplam: ${cekDogru}/${cekToplam} (${yuzde(oran(cekDogru, cekToplam))}); eşik ${yuzde(ESIK)}.`,
  `Altın alıntıların hepsi kılavuzda birebir ve değeri içeriyor: ${altinGecerli ? 'evet' : 'hayır'}.`,
  '',
  '## DOCX denetimi (docxcheck ve LibreOffice)',
  '',
  '| Belge | Kaynak | Hatasız | Uyumsuz alan | LibreOffice sayfa numaraları |',
  '|---|---|---|---|---|',
  ...docxler.map(
    (d) =>
      `| ${d.ad} | ${d.kaynak} | ${d.hatasiz ? 'evet' : 'hayır'} | ${d.uyumsuz.join(', ') || '-'} | ${d.libreOffice.varMi ? (d.libreOffice.ok ? `tamam (${d.libreOffice.sayfa} sayfa)` : `sorun: ${d.libreOffice.sorunlar?.join('; ')}`) : 'soffice yok'} |`,
  ),
  '',
  '## Plan 15.3/3 ölçütleri',
  '',
  `- Çekirdek alanlarda %95 ve üstü doğruluk, en az ${GEREKEN_KILAVUZ} kılavuz: **${olcutler.cekirdekDogruluk.gecti ? 'geçti' : 'geçmedi'}**${olcutler.cekirdekDogruluk.neden ? ` (${olcutler.cekirdekDogruluk.neden})` : ''}`,
  `- ${GEREKEN_DOCX} kılavuzda hatasız .docx: **${olcutler.hatasizDocx.gecti ? 'geçti' : 'geçmedi'}** (kılavuz altınından ${olcutler.hatasizDocx.kilavuzdanHatasiz}, sentetik dahil ${olcutler.hatasizDocx.hatasiz} hatasız)${olcutler.hatasizDocx.neden ? ` (${olcutler.hatasizDocx.neden})` : ''}`,
  '',
];
writeFileSync(`${klasor('raporlar')}${gun}-${mod}.md`, `${md.join('\n')}\n`);
console.log(md.join('\n'));
