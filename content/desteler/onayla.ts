// Editor approval of one card (plan 10.6/4). Run with Node 24 or newer, no dependencies:
//
//   node content/desteler/onayla.ts --kart anayasa-hukuku.001 --editor "Ad Soyad"
//   node content/desteler/onayla.ts --liste                      cards that wait for approval
//
// The rules live in apps/web/src/app/pratik/_alan/onay.ts: the source must be verified word for word
// (dogrula.ts), the author cannot approve, one editor approves a version once, HMGS cards need two different
// editors. The change is a normal file edit: it is reviewed in a pull request like any other content change.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desteSchema, type Deste } from '../../apps/web/src/app/pratik/_alan/kart.ts';
import { OnayHatasi, onayKuyrugu, onayla } from '../../apps/web/src/app/pratik/_alan/onay.ts';

const klasor = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const deger = (ad: string) => {
  const i = args.indexOf(ad);
  return i >= 0 ? args[i + 1] : undefined;
};

const dosyalar = readdirSync(klasor)
  .filter((f) => f.endsWith('.json'))
  .sort();
const desteler = dosyalar.map((f) => ({
  yol: join(klasor, f),
  deste: desteSchema.parse(JSON.parse(readFileSync(join(klasor, f), 'utf8'))) as Deste,
}));

if (args.includes('--liste')) {
  for (const s of onayKuyrugu(desteler.map((d) => d.deste))) {
    console.log(
      `${s.kart.id}\t${s.durum}\t${s.eksikOnay} approval(s) missing${s.hmgs ? ' (HMGS, two editors)' : ''}`,
    );
  }
  process.exit(0);
}

const kartId = deger('--kart');
const editor = deger('--editor');
if (!kartId || !editor) {
  console.error('usage: --kart <id> --editor "<name>" [--tarih YYYY-MM-DD]   or   --liste');
  process.exit(2);
}
const hedef = desteler.find((d) => d.deste.kartlar.some((k) => k.id === kartId));
if (!hedef) {
  console.error(`no card ${kartId}`);
  process.exit(2);
}
const tarih = deger('--tarih') ?? new Date().toISOString().slice(0, 10);
try {
  hedef.deste.kartlar = hedef.deste.kartlar.map((k) =>
    k.id === kartId ? onayla(k, editor, tarih, hedef.deste.hmgsAlani !== null) : k,
  );
} catch (e) {
  if (e instanceof OnayHatasi) {
    console.error(`refused (${e.kod}): ${e.message}`);
    process.exit(1);
  }
  throw e;
}
writeFileSync(hedef.yol, `${JSON.stringify(hedef.deste, null, 2)}\n`);
execFileSync('pnpm', ['exec', 'prettier', '--write', hedef.yol], { stdio: 'ignore' });
console.log(`${kartId} approved by ${editor}.`);
