/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyAuthority, isBinding } from '../src/authority.ts';
import { chunkText } from '../src/chunk.ts';
import { toBibtex, toPlainList, toRis, type ExportItem } from '../src/export.ts';
import { FIXTURE_VERSION, fixtureRecords } from '../src/fixture.ts';
import { ageLabel, computeLabels, relevanceLabel, staleData } from '../src/labels.ts';
import { detectLanguage, parseQuery } from '../src/query.ts';
import { fuse, maxRrf, rrf, RRF_K } from '../src/rrf.ts';
import { DEFAULT_WEIGHTS, fromFlatWeights, importance, relevance } from '../src/scoring.ts';
import { filterSql, orTsQuery } from '../src/sql.ts';
import { cosine, trigramEmbedder, httpEmbedder } from '../src/vector.ts';
import { MAX_SENTENCES, MAX_WORDS, MIN_QUOTE_CHARS, parseModelLine } from '../src/index.ts';

const NOW = new Date('2026-11-07T12:00:00Z');

it('exposes Ek D limits and the model line parser', () => {
  expect([MAX_SENTENCES, MAX_WORDS, MIN_QUOTE_CHARS, RRF_K]).toEqual([3, 70, 12, 60]);
  expect(parseModelLine('{"t":"son"}')).toEqual({ t: 'son' });
});

describe('reciprocal rank fusion (k=60)', () => {
  it('sums 1/(k+rank) over lists, ignores duplicates within a list and breaks ties by first seen', () => {
    const s = rrf([
      ['a', 'b', 'a'],
      ['b', 'c'],
    ]);
    expect(s.get('a')).toBeCloseTo(1 / 61);
    expect(s.get('b')).toBeCloseTo(1 / 62 + 1 / 61);
    expect(
      fuse([
        ['x', 'y'],
        ['y', 'x'],
      ]).map((f) => f.id),
    ).toEqual(['x', 'y']);
    expect(maxRrf(2)).toBeCloseTo(2 / 61);
  });
});

describe('scores', () => {
  it('relevance rises with fusion, coverage, norm and identity and stays within 0..1', () => {
    const base = { fusedNorm: 0.5, coverage: 0.5, normMatch: false, identity: false };
    expect(relevance(base)).toBeCloseTo(0.45 * 0.5 * 0.5 + 0.35 * 0.5);
    expect(relevance({ ...base, normMatch: true })).toBeGreaterThan(relevance(base));
    expect(relevance({ ...base, similarity: 0.9 })).toBeGreaterThan(relevance(base));
    expect(relevance({ fusedNorm: 1, coverage: 1, normMatch: true, identity: true })).toBe(1);
  });
  it('importance follows authority, board, citations and status', () => {
    const r = {
      authorityClass: 'emsal',
      chamber: null,
      citedByCount: null,
      openalexCitedBy: null,
      status: 'bilinmiyor',
    } as const;
    expect(
      importance({ ...r, chamber: 'Hukuk Genel Kurulu', authorityClass: 'yuksek_emsal' }),
    ).toBeGreaterThan(importance(r));
    expect(importance({ ...r, citedByCount: 50 })).toBeGreaterThan(importance(r));
    expect(importance({ ...r, status: 'bozuldu' })).toBeLessThan(importance(r));
  });
  it('reads the admin panel flat weight map and ignores unknown keys', () => {
    const w = fromFlatWeights({
      normBonus: 0.4,
      'authority.emsal': 0.9,
      'statusPenalty.bozuldu': 0.5,
      bilinmeyen: 3,
      fused: NaN,
    });
    expect(w.normBonus).toBe(0.4);
    expect(w.authority.emsal).toBe(0.9);
    expect(w.statusPenalty.bozuldu).toBe(0.5);
    expect(w.fused).toBe(DEFAULT_WEIGHTS.fused);
    expect('bilinmeyen' in w).toBe(false);
  });
});

describe('labels (SRS 3.3, plan 7.3)', () => {
  it('ages: Yeni up to 3 years, Yerleşik up to 10, then Eski', () => {
    expect(ageLabel('2025-10-23', NOW)).toBe('yeni');
    expect(ageLabel('2021-11-09', NOW)).toBe('yerlesik');
    expect(ageLabel('2006-09-20', NOW)).toBe('eski');
    expect(ageLabel(null, NOW)).toBeNull();
  });
  it('relevance bands and stale data', () => {
    expect([relevanceLabel(0.7), relevanceLabel(0.4), relevanceLabel(0.1)]).toEqual([
      'ilgililik_yuksek',
      'ilgililik_orta',
      'ilgililik_arka_plan',
    ]);
    expect(staleData('2026-10-01T00:00:00Z', NOW, 7)).toBe(true);
    expect(staleData('2026-11-06T00:00:00Z', NOW, 7)).toBe(false);
    expect(staleData(null, NOW, 7)).toBe(true);
  });
  it('computes the full label set in display order', () => {
    const hgk = fixtureRecords().find(
      (r) => r.chamber === 'Hukuk Genel Kurulu' && r.date?.startsWith('2006'),
    )!;
    expect(computeLabels({ ...hgk, anonymized: true, status: 'bozuldu', liveOnly: true }, 0.65, NOW)).toEqual(
      ['eski', 'oncu', 'anonimlestirildi', 'ilgililik_yuksek', 'guncellik_uyarisi', 'canli_kaynak'],
    );
  });
});

describe('authority classes (Ek F)', () => {
  it.each([
    [{ type: 'mevzuat', court: null, chamber: null, status: 'yururlukte' }, 'baglayici_norm'],
    [{ type: 'karar', court: 'Yargıtay', chamber: 'Hukuk Genel Kurulu' }, 'yuksek_emsal'],
    [
      { type: 'karar', court: 'Yargıtay', chamber: 'İçtihadı Birleştirme Büyük Genel Kurulu' },
      'baglayici_karar',
    ],
    [{ type: 'karar', court: 'Yargıtay', chamber: '4. Hukuk Dairesi' }, 'emsal'],
    [
      { type: 'karar', court: 'Anayasa Mahkemesi', chamber: null, aymKind: 'norm_denetimi' },
      'baglayici_karar',
    ],
    [
      { type: 'karar', court: 'Anayasa Mahkemesi', chamber: null, aymKind: 'bireysel_basvuru' },
      'yuksek_emsal',
    ],
    [{ type: 'karar', court: 'İstanbul Bölge Adliye Mahkemesi', chamber: null }, 'emsal_sinirli'],
    [{ type: 'kurul_karari', court: 'Kişisel Verileri Koruma Kurulu', chamber: null }, 'idari_karar'],
    [{ type: 'makale', court: null, chamber: null }, 'doktrin'],
    [{ type: 'ab_hukuku', court: null, chamber: null }, 'karsilastirmali'],
    [{ type: 'karar', court: 'Uyuşmazlık Mahkemesi', chamber: null }, 'baglayici_karar'],
  ] as const)('%o -> %s', (input, expected) => {
    expect(classifyAuthority(input)).toBe(expected);
  });
  it('binding classes', () => {
    expect(isBinding('baglayici_norm') && isBinding('baglayici_karar') && !isBinding('yuksek_emsal')).toBe(
      true,
    );
  });
  it('agrees with the fixture corpus', () => {
    for (const r of fixtureRecords())
      expect(classifyAuthority({ ...r, jurisdiction: r.jurisdiction }), r.title).toBe(r.authorityClass);
  });
});

describe('query analysis', () => {
  it('detects language and resolves references', () => {
    expect(detectLanguage('kişisel veri nedir')).toBe('tr');
    expect(detectLanguage('what is the right to erasure')).toBe('en');
    expect(parseQuery('TBK 49 ve 4. HD 2021/26076 E., 2024/10643 K.')).toMatchObject({
      norms: [{ kanunNo: '6098', madde: '49' }],
      decisions: [{ esasNo: '2021/26076', kararNo: '2024/10643' }],
      lang: 'tr',
    });
  });
});

describe('chunking', () => {
  it('keeps offsets into the full text and splits long paragraphs at sentence ends', () => {
    const long = `${'Bu bir cümledir ve hukuk metnidir. '.repeat(60)}`.trim();
    const text = `Kısa paragraf.\n${long}\nSon paragraf burada.`;
    const chunks = chunkText('r', text, { max: 400, min: 100 });
    for (const c of chunks) {
      expect(text.slice(c.charStart, c.charEnd)).toBe(c.text);
      expect(c.text.length).toBeLessThanOrEqual(400);
    }
    expect(chunks.map((c) => c.seq)).toEqual(chunks.map((_, i) => i));
  });
  it('does not cut after "m." or "E."', () => {
    const chunks = chunkText(
      'r',
      `${'a '.repeat(150)}KVKK m. 11 ve E. 2019/1 sayılı karar. Sonra yeni cümle gelir ${'b '.repeat(150)}`,
      {
        max: 330,
        min: 10,
      },
    );
    expect(chunks.some((c) => c.text.endsWith('m.') || c.text.endsWith('E.'))).toBe(false);
  });
});

describe('vectors', () => {
  it('trigram vectors are unit length and spelling tolerant', async () => {
    const e = trigramEmbedder(128);
    const [a, b, c] = await e.embed(
      ['özel nitelikli kişisel veri', 'ozel nitelikli kisisel veri', 'haksız fiil tazminat'],
      'query',
    );
    expect(cosine(a!, a!)).toBeCloseTo(1);
    expect(cosine(a!, b!)).toBeCloseTo(1);
    expect(cosine(a!, c!)).toBeLessThan(0.5);
  });
  it('the HTTP embedder checks model and shape and never accepts a mismatch', async () => {
    const ok = httpEmbedder({
      url: 'http://nlp.local/embed',
      model: 'm1',
      dimensions: 2,
      fetch: async () => Response.json({ model: 'm1', vectors: [[0.1, 0.2]] }),
    });
    expect(await ok.embed(['q'], 'query')).toEqual([[0.1, 0.2]]);
    const wrong = httpEmbedder({
      url: 'http://nlp.local/embed',
      model: 'm1',
      dimensions: 2,
      fetch: async () => Response.json({ model: 'm2', vectors: [[0.1, 0.2]] }),
    });
    await expect(wrong.embed(['q'], 'query')).rejects.toThrow('mismatch');
    const shape = httpEmbedder({
      url: 'http://nlp.local/embed',
      model: 'm1',
      dimensions: 3,
      fetch: async () => Response.json({ model: 'm1', vectors: [[0.1, 0.2]] }),
    });
    await expect(shape.embed(['q'], 'query')).rejects.toThrow('shape');
  });
});

describe('SQL helpers', () => {
  it('numbers filter parameters from the given position and escapes LIKE wildcards', () => {
    expect(filterSql({ type: 'karar', from: '2020-01-01', court: '50%_x' }, 4)).toEqual({
      sql: " AND r.type = $4::record_type AND r.decision_date >= $5::date AND (coalesce(r.court, '') || ' ' || coalesce(r.chamber, '')) ILIKE $6",
      params: ['karar', '2020-01-01', '%50\\%\\_x%'],
    });
    expect(filterSql({}, 1)).toEqual({ sql: '', params: [] });
  });
  it('builds an OR tsquery from letters and digits only', () => {
    expect(orTsQuery(parseQuery("KVKK'nın 11. maddesi & !(silme) | <-> :*"))).toBe(
      'kvkk | 11 | maddesi | silme',
    );
    expect(orTsQuery(parseQuery('&&&'))).toBe('');
  });
});

describe('export (FR-24, RIS and BibTeX)', () => {
  const items: ExportItem[] = [
    {
      recordId: '6f1765eb-fa26-5f4a-9628-bc40e6769cba',
      type: 'karar',
      title: 'Yargıtay Hukuk Genel Kurulu E. 2018/20 K. 2021/1383',
      court: 'Yargıtay',
      chamber: 'Hukuk Genel Kurulu',
      esasNo: '2018/20',
      kararNo: '2021/1383',
      date: '2021-11-09',
      sourceUrl: 'https://karararama.yargitay.gov.tr/',
      jurisdiction: 'TR',
      note: 'Not: %100 {önemli}\nikinci satır',
    },
    {
      recordId: '11111111-2222-4333-8444-555555555555',
      type: 'mevzuat',
      title: 'Kişisel Verilerin Korunması Kanunu m.11 İlgili kişinin hakları',
      court: null,
      chamber: null,
      esasNo: null,
      kararNo: null,
      date: '2016-04-07',
      sourceUrl: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6698&MevzuatTur=1&MevzuatTertip=5',
      jurisdiction: 'TR',
      note: null,
    },
  ];
  it('writes RIS with CRLF, one line per tag', () => {
    const ris = toRis(items);
    expect(ris.split('\r\n')).toEqual([
      'TY  - CASE',
      'TI  - Yargıtay Hukuk Genel Kurulu E. 2018/20 K. 2021/1383',
      'A2  - Yargıtay',
      'SE  - Hukuk Genel Kurulu',
      'M1  - E. 2018/20 K. 2021/1383',
      'PY  - 2021',
      'DA  - 2021/11/09',
      'CY  - TR',
      'UR  - https://karararama.yargitay.gov.tr/',
      'N1  - Not: %100 {önemli} ikinci satır',
      'ER  - ',
      '',
      'TY  - STAT',
      'TI  - Kişisel Verilerin Korunması Kanunu m.11 İlgili kişinin hakları',
      'PY  - 2016',
      'DA  - 2016/04/07',
      'CY  - TR',
      'UR  - https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6698&MevzuatTur=1&MevzuatTertip=5',
      'ER  - ',
      '',
    ]);
  });
  it('writes BibTeX with escaped values and protected titles', () => {
    const bib = toBibtex(items);
    expect(bib).toContain('@misc{karar20216f1765,');
    expect(bib).toContain('title = {{Yargıtay Hukuk Genel Kurulu E. 2018/20 K. 2021/1383}}');
    expect(bib).toContain('note = {Not: \\%100 \\{önemli\\} ikinci satır}');
    expect(bib).toContain('type = {legislation}');
    expect(bib.endsWith('}\n')).toBe(true);
    expect(toBibtex([])).toBe('');
  });
  it('writes a plain list for copying', () => {
    expect(toPlainList(items).split('\n')[0]).toBe(
      'Yargıtay Hukuk Genel Kurulu E. 2018/20 K. 2021/1383, T. 09.11.2021, https://karararama.yargitay.gov.tr/',
    );
  });
});

describe('fixture corpus and browser build', () => {
  it('fixture records are complete, unique and free of U+2014', () => {
    const recs = fixtureRecords();
    expect(FIXTURE_VERSION).toBe('fikstur-2026-11-07');
    expect(recs).toHaveLength(75);
    expect(new Set(recs.map((r) => r.id)).size).toBe(recs.length);
    for (const r of recs) {
      expect(r.text.length, r.title).toBeGreaterThan(100);
      expect(r.text.includes(String.fromCharCode(0x2014))).toBe(false);
      expect(r.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('the validator entry and everything it imports are browser safe', () => {
    const src = fileURLToPath(new URL('../src/', import.meta.url));
    const seen = new Set<string>();
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const code = readFileSync(src + file, 'utf8');
      expect(code, file).not.toMatch(/from 'node:|require\(|process\.|localStorage|sessionStorage|fetch\(/);
      for (const m of code.matchAll(/^(?:import|export)(?! type)[^'"]*from '(\.[^']+)'/gm)) {
        const target = new URL(m[1]!, new URL(file, 'file:///x/')).pathname.slice(3);
        visit(target);
      }
    };
    visit('validator-entry.ts');
    expect([...seen].sort()).toEqual(
      [
        'validator-entry.ts',
        'normalize.ts',
        'answer/names.ts',
        'answer/validator.ts',
        'answer/passages.ts',
        'authority.ts',
      ].sort(),
    );
    expect(readdirSync(src)).toContain('validator-entry.ts');
  });
});
