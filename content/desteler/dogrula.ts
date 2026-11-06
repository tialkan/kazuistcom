// Source verification of the cards in this directory (plan 10.6/4). Run with Node 24 or newer, no dependencies:
//
//   node content/desteler/dogrula.ts                       check every quotation against the live page
//   node content/desteler/dogrula.ts --yerel <klasor>      read pages saved in a folder (<kanunNo>.html or .txt)
//   node content/desteler/dogrula.ts --isaretle            write dogrulamaTarihi and maddeOzeti for passing cards
//   node content/desteler/dogrula.ts --goster 2709 125     print the text of one article (for card authors)
//
// A quotation passes only when it appears word for word in the cited article. A card whose article text changed
// since its last check (maddeOzeti differs) fails, so a legislative amendment sends the card back to review.
// The script never guesses: an unreachable page is a failure, not a pass.
//
// Fetching: pages are requested one at a time, two seconds apart, with the declared KazuistBot user agent. The
// mevzuat.gov.tr server answers non browser clients with a time out; in that case save the page from a browser
// (right click, save as) into a folder and pass --yerel. anayasa.gov.tr answers normally.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desteSchema, type Deste, type Kaynak } from '../../apps/web/src/app/pratik/_alan/kart.ts';
import {
  alintiVarMi,
  htmlMetne,
  karsilastirmaBicimi,
  maddeMetni,
  maddeOzeti,
  mevzuatMetinAdresi,
} from '../../apps/web/src/app/pratik/_alan/dogrulama.ts';

const klasor = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const bayrak = (ad: string) => args.includes(ad);
const deger = (ad: string) => {
  const i = args.indexOf(ad);
  return i >= 0 ? args[i + 1] : undefined;
};

const yerel = deger('--yerel');
const bugun = deger('--tarih') ?? new Date().toISOString().slice(0, 10);

function yukle(): { dosya: string; deste: Deste }[] {
  return readdirSync(klasor)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({
      dosya: join(klasor, f),
      deste: desteSchema.parse(JSON.parse(readFileSync(join(klasor, f), 'utf8'))),
    }));
}

const onbellek = new Map<string, string>();
async function sayfaMetni(k: Kaynak): Promise<string> {
  const anahtar = `${k.kaynak}:${k.kanunNo}`;
  const var_ = onbellek.get(anahtar);
  if (var_ !== undefined) return var_;
  let ham: string | undefined;
  if (yerel) {
    for (const uzanti of ['html', 'txt']) {
      const yol = join(yerel, `${k.kanunNo}.${uzanti}`);
      if (existsSync(yol)) ham = readFileSync(yol, 'utf8');
    }
    if (ham === undefined) throw new Error(`no saved page ${join(yerel, k.kanunNo)}.html`);
  } else {
    const adres =
      k.kaynak === 'mevzuat.gov.tr' ? mevzuatMetinAdresi(k.mevzuatTur ?? 1, k.kanunNo, k.tertip ?? 5) : k.url;
    await new Promise((r) => setTimeout(r, 2000));
    const yanit = await fetch(adres, {
      headers: { 'User-Agent': 'KazuistBot/1.0 (+https://kazuist.com/bot)' },
      signal: AbortSignal.timeout(20_000),
    }).catch((e: unknown) => {
      throw new Error(
        `could not fetch ${adres} (${e instanceof Error ? e.message : String(e)}); save the page and use --yerel`,
      );
    });
    if (!yanit.ok) throw new Error(`${adres} answered ${yanit.status}`);
    ham = await yanit.text();
  }
  const metin = ham.includes('<') ? htmlMetne(ham) : ham.replace(/\s+/g, ' ');
  onbellek.set(anahtar, metin);
  return metin;
}

if (bayrak('--goster')) {
  const [no, madde] = args.slice(args.indexOf('--goster') + 1);
  const deste = yukle()
    .flatMap((d) => d.deste.kartlar)
    .flatMap((c) => c.kaynaklar)
    .find((k) => k.kanunNo === no);
  if (!deste || !madde) {
    console.error('usage: --goster <kanunNo> <madde>, the law must be cited by at least one card');
    process.exit(2);
  }
  console.log(maddeMetni(await sayfaMetni(deste), madde) ?? 'no such article');
  process.exit(0);
}

let sorun = 0;
let gecen = 0;
for (const { dosya, deste } of yukle()) {
  let degisti = false;
  for (const kart of deste.kartlar) {
    for (const k of kart.kaynaklar) {
      const etiket = `${kart.id} ${k.kanunAdi} ${k.bolum === 'madde' ? `m.${k.madde}` : '(künye)'}`;
      try {
        const sayfa = await sayfaMetni(k);
        const kapsam = k.bolum === 'madde' ? maddeMetni(sayfa, k.madde as string) : sayfa;
        if (kapsam === null) throw new Error('article not found in the page');
        const eksik = k.alintilar.filter((a) => !alintiVarMi(kapsam, a));
        if (eksik.length) throw new Error(`quotation not found: "${eksik[0]?.slice(0, 80)}"`);
        const ozet = maddeOzeti(
          k.bolum === 'madde' ? kapsam : k.alintilar.map(karsilastirmaBicimi).join('|'),
        );
        if (k.maddeOzeti !== null && k.maddeOzeti !== ozet) {
          throw new Error(
            `article text changed since ${k.dogrulamaTarihi} (${k.maddeOzeti} -> ${ozet}); review the card`,
          );
        }
        gecen++;
        if (bayrak('--isaretle') && (k.dogrulamaTarihi === null || k.maddeOzeti === null)) {
          k.dogrulamaTarihi = bugun;
          k.maddeOzeti = ozet;
          degisti = true;
        }
      } catch (e) {
        sorun++;
        console.error(`FAIL ${etiket}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  if (degisti) {
    writeFileSync(dosya, `${JSON.stringify(deste, null, 2)}\n`);
    try {
      execFileSync('pnpm', ['exec', 'prettier', '--write', dosya], { stdio: 'ignore' });
    } catch {
      console.error(`note: run prettier on ${dosya}`);
    }
  }
}
console.log(`${gecen} source checks passed, ${sorun} failed.`);
process.exit(sorun ? 1 : 0);
