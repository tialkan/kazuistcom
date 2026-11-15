/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known examples */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { promptPassage } from '../src/answer/passages.ts';
import { chunkText } from '../src/chunk.ts';
import { fixtureRecords } from '../src/fixture.ts';
import { MemoryBackend } from '../src/memory.ts';
import { LINE_BREAK, PANEL_LINE, showsPanelNames } from '../src/panel.ts';
import { parseQuery } from '../src/query.ts';
import type { CorpusRecord } from '../src/types.ts';

/**
 * Open panel member names (plan Ek E, FR-21, FR-80): no passage is cut in TypeScript from a text that may show
 * them. The patterns are shared with services/worker-py/nlp/tests/test_panel_names.py, which runs them on the
 * real AYM, Yargıtay and Danıştay decisions. Every name here is SYNTHETIC.
 */
const SHARED = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/kurul-satiri.json', import.meta.url)), 'utf8'),
) as { line: string; lineBreak: string };

const MEMBERS = ['Ayla ÖRNEKSOY', 'Cem DENEMEOĞLU', 'Ece SINAMALI'];

/** A constitutional court decision laid out like the AYM texts, with the panel left readable (open source). */
const OPEN_PANEL_TEXT = [
  'TÜRKİYE CUMHURİYETİ',
  'ANAYASA MAHKEMESİ',
  'İKİNCİ BÖLÜM',
  'KARAR',
  'Başkan : Ayla ÖRNEKSOY',
  'Üyeler : Cem DENEMEOĞLU',
  'Ece SINAMALI',
  'Raportör : [Raportör]',
  'Başvurucu : [Başvurucu]',
  'I. BAŞVURUNUN KONUSU',
  '1. Başvuru, kamulaştırmasız el atma nedeniyle açılan tazminat davasının makul sürede sonuçlandırılmaması nedeniyle adil yargılanma hakkının ihlal edildiği iddiasına ilişkindir.',
  'II. DEĞERLENDİRME',
  '2. Mahkeme, davanın karmaşıklığı ve başvurucunun tutumu bakımından yargılama süresini makul bulmamıştır.',
  'III. HÜKÜM',
  'Açıklanan gerekçelerle makul sürede yargılanma hakkının ihlal edildiğine OYBİRLİĞİYLE karar verildi.',
  'Başkan Ayla ÖRNEKSOY Üye Cem DENEMEOĞLU Üye Ece SINAMALI',
].join('\n');

const openRecord = (): CorpusRecord => ({
  ...fixtureRecords().find((r) => r.type === 'karar')!,
  id: '00000000-0000-4000-8000-00000000a7a1',
  title: 'Anayasa Mahkemesi, İkinci Bölüm, B. No: 2099/1 (01.01.2025)',
  court: 'Anayasa Mahkemesi',
  esasNo: '2099/1',
  kararNo: null,
  text: OPEN_PANEL_TEXT,
});

describe('open panel names stay out of TypeScript passages (plan Ek E)', () => {
  it('uses the patterns the Python test runs on the real decisions', () => {
    expect(PANEL_LINE.source).toBe(SHARED.line);
    expect(LINE_BREAK.source).toBe(SHARED.lineBreak);
  });

  it('flags every panel layout the anonymizer keeps readable and leaves masked panels alone', () => {
    for (const t of [
      OPEN_PANEL_TEXT,
      'Karar\nBaşkan : Ayla ÖRNEKSOY',
      'Başkanvekili Cem DENEMEOĞLU Üye Ece SINAMALI',
      'Üye\nEce SINAMALI',
      '\tÜYELER:\nCem DENEMEOĞLU',
      'Karar\u2028Başkan : Ayla ÖRNEKSOY',
      'Karar\u0085Üyeler : Cem DENEMEOĞLU',
    ])
      expect(showsPanelNames(t)).toBe(true);
    for (const t of [
      'Başkan : [Hâkim 1]\nÜyeler : [Hâkim 2]\n[Hâkim 3]',
      'Başkan [Hâkim 1] Üye [Hâkim 2]',
      '1. Belediye Başkanı [Kişi 1] dinlenmiştir.',
      'Başkanlık Divanı kararı incelenmiştir.',
    ])
      expect(showsPanelNames(t)).toBe(false);
  });

  it('cuts every fixture record as before: the fixture corpus shows no panel name', () => {
    expect(fixtureRecords().filter((r) => showsPanelNames(r.text))).toEqual([]);
  });

  it('MemoryBackend keeps the record but cuts no passage from an open panel text', async () => {
    const rec = openRecord();
    const backend = new MemoryBackend([...fixtureRecords(), rec]);
    expect((await backend.records([rec.id]))[0]!.text).toBe(OPEN_PANEL_TEXT);
    for (const name of MEMBERS) {
      const hits = await backend.fullText(parseQuery(name), {}, 100);
      expect(hits.map((h) => h.id)).not.toContain(rec.id);
    }
    expect(await backend.passages(parseQuery('kamulaştırmasız el atma'), [rec.id], 2)).toEqual([]);
  });

  it('keeps the masked_text offsets of a passage whose text the worker shortened with [Üye n]', () => {
    const rec = openRecord();
    const first = chunkText(rec.id, rec.text, { sections: true }).find((c) => c.text.includes(MEMBERS[0]!));
    // What the worker writes (services/worker-py/nlp/panel_names.py): every member as "[Üye n]".
    const text = MEMBERS.reduce((t, n, i) => t.replaceAll(n, `[Üye ${i + 1}]`), first!.text);
    const chunk = { ...first!, text };
    expect(chunk.text.length).toBeLessThan(first!.text.length);
    const p = promptPassage('K1', rec, chunk, 1600);
    expect(p.body).toBe(chunk.text);
    expect([p.charStart, p.charEnd]).toEqual([first!.charStart, first!.charEnd]);
    expect(MEMBERS.some((n) => p.text.includes(n))).toBe(false);
  });
});
