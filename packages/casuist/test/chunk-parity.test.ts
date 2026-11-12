import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chunkText, type ChunkOptions } from '../src/chunk.ts';
import { fixtureRecords } from '../src/fixture.ts';

/**
 * Chunk boundaries shared with services/worker-py/nlp/chunk.py, the embed.chunks consumer that writes the
 * chunks table in production. Both test suites read fixtures/parcalar.json, so a change of the rule on one side
 * fails until the other side follows. After an intentional change run
 * `KAZUIST_PARCALAR_YAZ=1 pnpm --filter @kazuist/casuist test`, format the file with prettier and port the change
 * to chunk.py.
 * Ranges are [charStart, charEnd) in UTF-16 code units.
 */
const FILE = fileURLToPath(new URL('../fixtures/parcalar.json', import.meta.url));

type Range = [number, number];
interface Example {
  ad: string;
  metin: string;
  max?: number;
  min?: number;
  parcalar: Range[];
}
interface Golden {
  aciklama: string;
  kayitlar: Record<string, Range[]>;
  ornekler: Example[];
}

/** Synthetic edge cases; no real names. */
const EXAMPLES: Omit<Example, 'parcalar'>[] = [
  {
    ad: 'kisaltmalar',
    metin:
      'Davacı vekili KVKK m. 11 uyarınca başvurdu. Yargıtay 4. HD E. 2021/1 K. 2022/2 sayılı kararına bkz. ' +
      'Dosya vd. Ayrıca T.C. Anayasası m.20 ve örn. Kurul kararı ile ör. Danıştay görüşü, syf. 12 ve no. 5 ' +
      'anıldı. Sonuç: Talep reddedildi. Gerekçe; Kanun açıktır! Neden? Çünkü (1) bent uygulanır. ' +
      'Karar “Kesin” olarak verildi: 2024 yılında. Ancak sonraki cümle küçük harfle başlar. son.',
    max: 120,
    min: 30,
  },
  {
    ad: 'kisa-paragraflar',
    metin: Array.from({ length: 14 }, (_, i) => `Madde ${i + 1}. Kısa bir hüküm.`).join('\n'),
    max: 300,
  },
  {
    ad: 'bosluksuz-uzun',
    metin: `Giriş cümlesi.\n${'abcçdefgğh'.repeat(40)}\nSon.`,
    max: 150,
    min: 20,
  },
  {
    ad: 'bmp-disi',
    metin:
      `Önce \u{1D400}. Sonra \u{20000} geldi. ${'Kısa cümle burada. '.repeat(8)}` +
      `\u{1D400}\u{1D401} yazıldı. Bir. \u{1D402}ki üç. ${'x\u{20000} '.repeat(30)}son.`,
    max: 90,
    min: 25,
  },
  {
    ad: 'bosluk-turleri',
    metin:
      '\t  Birinci paragraf sekmeyle başlar.\r\n\u00a0İkinci\u00a0paragraf bölünmez boşluklu.\r\n\r\n' +
      '\u3000Üçüncü. Dördüncü cümle\tsekmeli. Beşinci\u2003cümle. Altıncı.\u00a0Yedinci.   \n   \n' +
      `${'Uzun bir cümle daha geliyor. '.repeat(6)}\u2028son satır`,
    max: 80,
    min: 10,
  },
  {
    ad: 'pencere-siniri',
    metin: `${'k'.repeat(55)} bir. İki ${'m'.repeat(40)} üç: Dört (beş) "Altı" 7 sekiz.`,
    max: 60,
    min: 5,
  },
  { ad: 'bos', metin: '' },
  { ad: 'yalniz-bosluk', metin: ' \n\t\n\u00a0 ' },
];

function ranges(id: string, text: string, opts?: ChunkOptions): Range[] {
  return chunkText(id, text, opts).map((c): Range => [c.charStart, c.charEnd]);
}

function build(): Golden {
  const kayitlar: Record<string, Range[]> = {};
  for (const r of fixtureRecords()) kayitlar[r.id] = ranges(r.id, r.text);
  return {
    aciklama:
      'chunkText sınırları (UTF-16 birimi, [başlangıç, bitiş)). packages/casuist/test/chunk-parity.test.ts üretir; ' +
      'services/worker-py/nlp/tests/test_chunk.py aynı sınırları bekler.',
    kayitlar,
    ornekler: EXAMPLES.map((e) => ({
      ...e,
      parcalar: ranges(e.ad, e.metin, { max: e.max, min: e.min }),
    })),
  };
}

describe('chunk boundaries shared with the Python embed.chunks consumer', () => {
  const fresh = build();
  if (process.env.KAZUIST_PARCALAR_YAZ === '1')
    writeFileSync(FILE, `${JSON.stringify(fresh, null, 2)}\n`, 'utf8');

  it('fixtures/parcalar.json matches chunkText for the fixture corpus and the edge cases', () => {
    const golden = JSON.parse(readFileSync(FILE, 'utf8')) as Golden;
    expect(golden).toEqual(fresh);
  });

  it('edge cases cover sentence ends, abbreviations, surrogate pairs and whitespace kinds', () => {
    const byName = new Map(fresh.ornekler.map((e) => [e.ad, e]));
    for (const e of fresh.ornekler) {
      for (const [s, t] of e.parcalar) {
        expect(e.metin.slice(s, t).trim()).not.toBe('');
        expect(t - s).toBeLessThanOrEqual(e.max ?? 1200);
      }
    }
    expect(byName.get('kisaltmalar')?.parcalar.length).toBeGreaterThan(3);
    expect(byName.get('bmp-disi')?.parcalar.length).toBeGreaterThan(2);
    expect(byName.get('bos')?.parcalar).toEqual([]);
    expect(byName.get('yalniz-bosluk')?.parcalar).toEqual([]);
  });
});
