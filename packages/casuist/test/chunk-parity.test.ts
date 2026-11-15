/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known examples */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chunkText, sectionsFor, type ChunkOptions } from '../src/chunk.ts';
import { fixtureRecords } from '../src/fixture.ts';

/**
 * Chunk boundaries shared with services/worker-py/nlp/chunk.py, the embed.chunks consumer that writes the
 * chunks table in production. Both test suites read fixtures/parcalar.json, so a change of the rule on one side
 * fails until the other side follows. After an intentional change run
 * `KAZUIST_PARCALAR_YAZ=1 pnpm --filter @kazuist/casuist test`, format the file with prettier and port the change
 * to chunk.py.
 * Ranges are [charStart, charEnd) in UTF-16 code units. Decisions (karar, kurul_karari) and the examples marked
 * `bolumlu` are cut with `sections: true`; their section labels are pinned in `bolumler`.
 */
const FILE = fileURLToPath(new URL('../fixtures/parcalar.json', import.meta.url));

type Range = [number, number];
type Section = string | null;
interface Example {
  ad: string;
  metin: string;
  max?: number;
  min?: number;
  bolumlu?: boolean;
  parcalar: Range[];
  bolumler?: Section[];
}
interface Golden {
  aciklama: string;
  kayitlar: Record<string, Range[]>;
  /** Section labels of the sectioned fixture records, by record id. */
  bolumler: Record<string, Section[]>;
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
  {
    ad: 'bolumler-satir-basi',
    metin:
      'MAHKEMESİ : Asliye Hukuk Mahkemesi\nDAVA TARİHİ : 01.01.2020\nTEMYİZ EDEN: Davacı vekili\n' +
      'I. DAVA\nDavacı vekili dava dilekçesinde tazminat istemiştir.\nII. CEVAP\nDavalı vekili davanın reddini ' +
      'istemiştir.\nV. TEMYİZ\nA. Temyiz Sebepleri\nDavacı vekili kararın bozulmasını istemiştir.\nC. Gerekçe\n' +
      'Somut olayda kişilik hakkı zedelenmiştir.\nVI. KARAR\nAçıklanan sebeplerle kararın BOZULMASINA karar ' +
      'verildi.\nKARŞI OY\nSayın çoğunluğun görüşüne katılmıyorum.\nKarşı oy:\nEk görüş.\nSonuç olarak bu satır ' +
      'başlık değildir.',
    max: 400,
    min: 60,
    bolumlu: true,
  },
  {
    ad: 'bolumler-satir-ici',
    metin:
      'Bölge Adliye Mahkemesi kararı temyiz edilmekle incelendi. I. DAVA Davacı vekili tazminat istemiştir. ' +
      'II. CEVAP Davalı vekili reddini istemiştir. III. İLK DERECE MAHKEMESİ KARARI Mahkemece dava kabul ' +
      'edilmiştir. V. TEMYİZ A. Temyiz Sebepleri Davacı vekili bozma istemiştir. B. Değerlendirme ve Gerekçe ' +
      'Uyuşmazlık kişilik hakkına ilişkindir. 2. Daire Kararı ile değil. VI. KARAR Açıklanan sebeplerle ' +
      'ONANMASINA karar verildi. SONUÇ:Kesin olarak. KARŞI OY Çoğunluğa katılmıyorum. DAVA TARİHİ 2020.',
    max: 1200,
    min: 200,
    bolumlu: true,
  },
  { ad: 'bos', metin: '' },
  { ad: 'yalniz-bosluk', metin: ' \n\t\n\u00a0 ' },
];

function ranges(id: string, text: string, opts?: ChunkOptions): Range[] {
  return chunkText(id, text, opts).map((c): Range => [c.charStart, c.charEnd]);
}

const sections = (id: string, text: string, opts?: ChunkOptions): Section[] =>
  chunkText(id, text, opts).map((c) => c.section);

function build(): Golden {
  const kayitlar: Record<string, Range[]> = {};
  const bolumler: Record<string, Section[]> = {};
  for (const r of fixtureRecords()) {
    const opts = { sections: sectionsFor(r.type) };
    kayitlar[r.id] = ranges(r.id, r.text, opts);
    if (opts.sections) bolumler[r.id] = sections(r.id, r.text, opts);
  }
  return {
    aciklama:
      'chunkText sınırları (UTF-16 birimi, [başlangıç, bitiş)) ve karar bölümleri. ' +
      'packages/casuist/test/chunk-parity.test.ts üretir; services/worker-py/nlp/tests/test_chunk.py aynı sınırları ' +
      've bölümleri bekler. Kararlar (karar, kurul_karari) ve bolumlu örnekler bölümlerle kesilir.',
    kayitlar,
    bolumler,
    ornekler: EXAMPLES.map((e) => {
      const opts = { max: e.max, min: e.min, sections: e.bolumlu ?? false };
      return {
        ...e,
        parcalar: ranges(e.ad, e.metin, opts),
        ...(e.bolumlu ? { bolumler: sections(e.ad, e.metin, opts) } : {}),
      };
    }),
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

  it('labels decision sections and never lets a passage span two of them', () => {
    const byName = new Map(fresh.ornekler.map((e) => [e.ad, e]));
    const satir = byName.get('bolumler-satir-basi')!;
    const labelled = satir.parcalar.map(
      ([s, t], i) => [satir.bolumler?.[i], satir.metin.slice(s, t)] as const,
    );
    expect(labelled.map(([b]) => b)).toEqual([
      null,
      'iddia',
      'iddia',
      'iddia',
      'gerekce',
      'hukum',
      'karsi_oy',
      'karsi_oy',
    ]);
    // Header fields ("DAVA TARİHİ :", "TEMYİZ EDEN:") are not headings; "V. TEMYİZ" joins "A. Temyiz Sebepleri".
    expect(labelled[0]?.[1]).toContain('TEMYİZ EDEN');
    expect(labelled[3]?.[1]).toMatch(/^V\. TEMYİZ\nA\. Temyiz Sebepleri/);
    expect(labelled[6]?.[1]).toBe('KARŞI OY\nSayın çoğunluğun görüşüne katılmıyorum.');
    expect(labelled[7]?.[1]).toBe('Karşı oy:\nEk görüş.\nSonuç olarak bu satır başlık değildir.');
    const ici = byName.get('bolumler-satir-ici')!;
    expect(ici.bolumler).toEqual([
      null,
      'iddia',
      'iddia',
      'surec',
      'iddia',
      'gerekce',
      'hukum',
      'hukum',
      'karsi_oy',
    ]);
    expect(ici.metin.slice(...ici.parcalar[5]!)).toMatch(
      /^B\. Değerlendirme ve Gerekçe .*2\. Daire Kararı ile değil\.$/,
    );
    expect(ici.metin.slice(...ici.parcalar[8]!)).toBe('KARŞI OY Çoğunluğa katılmıyorum. DAVA TARİHİ 2020.');
    // Statutes are not sectioned: the same text without the option has no labels.
    expect(chunkText('x', satir.metin, { max: 400, min: 60 }).every((c) => c.section === null)).toBe(true);
  });
});
