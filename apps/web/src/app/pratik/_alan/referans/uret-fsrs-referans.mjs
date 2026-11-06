// Generates fsrs-referans.json with the reference implementation ts-fsrs 6.0.0 (MIT, FSRS-6).
// Run it from an empty directory that has ts-fsrs installed (nothing from this repository depends on it):
//   mkdir /tmp/fsrs-ref && cd /tmp/fsrs-ref && npm init -y && npm i ts-fsrs@6.0.0
//   node <path>/uret-fsrs-referans.mjs > fsrs-referans.json
// The scheduler variant is the long term one (enable_short_term false) without fuzz, which is what fsrs.ts implements.
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const { fsrs, createEmptyCard, generatorParameters, Rating } = require('ts-fsrs');

const f = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: false, request_retention: 0.9 }));
const f85 = fsrs(
  generatorParameters({ enable_fuzz: false, enable_short_term: false, request_retention: 0.85 }),
);

let tohum = 20261107;
const rastgele = () => {
  tohum = (tohum * 1664525 + 1013904223) % 4294967296;
  return tohum / 4294967296;
};

const kart = (c) => ({
  due: c.due.toISOString(),
  stability: c.stability,
  difficulty: c.difficulty,
  scheduledDays: c.scheduled_days,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
});

const baslangic = Date.UTC(2026, 10, 7, 9, 0, 0);
const senaryolar = [];
for (let n = 0; n < 8; n++) {
  const motor = n % 2 === 0 ? f : f85;
  let c = createEmptyCard(new Date(baslangic));
  let t = baslangic;
  const adimlar = [];
  for (let i = 0; i < 14; i++) {
    const gap = i === 0 ? 0 : Math.floor(rastgele() * (i % 5 === 0 ? 1 : 40));
    t += gap * 86_400_000 + Math.floor(rastgele() * 3_600_000);
    const rating = [Rating.Again, Rating.Hard, Rating.Good, Rating.Good, Rating.Easy][
      Math.floor(rastgele() * 5)
    ];
    const onizleme = motor.repeat(c, new Date(t));
    const sonraki = onizleme[rating].card;
    adimlar.push({
      simdi: new Date(t).toISOString(),
      derece: rating,
      sonuc: kart(sonraki),
      onizleme: Object.fromEntries([1, 2, 3, 4].map((g) => [g, onizleme[g].card.scheduled_days])),
    });
    c = sonraki;
  }
  senaryolar.push({
    hedefHatirlama: n % 2 === 0 ? 0.9 : 0.85,
    baslangic: new Date(baslangic).toISOString(),
    adimlar,
  });
}
console.log(JSON.stringify({ kaynak: 'ts-fsrs@6.0.0', senaryolar }, null, 2));
