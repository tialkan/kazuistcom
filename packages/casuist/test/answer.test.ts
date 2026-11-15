/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import type { AnswerEvent, ModelLine } from '@kazuist/contracts';
import { describe, expect, it } from 'vitest';
import {
  kunye,
  passagesFromPrompt,
  sectionOfKunye,
  selectPassages,
  sourceChips,
  STANDARD_SELECTION,
} from '../src/answer/passages.ts';
import { abstainReason, answerEvents, type AnswerTexts } from '../src/answer/stream.ts';
import { fixtureRecords, fixtureSearchDeps } from '../src/fixture.ts';
import { search } from '../src/search.ts';

const NOW = new Date('2026-11-07T12:00:00Z');
const texts: AnswerTexts = {
  sabitFr19: 'FR19',
  sabitFr20: 'FR20',
  cekimser: 'CEKIMSER',
  uyari: { veri_gunu: 'VG', guncellik: 'GU', destekleyici_kaynak: 'DK' },
};

async function* from(lines: (ModelLine | null)[]): AsyncGenerator<ModelLine | null> {
  for (const l of lines) yield l;
}
async function collect(it: AsyncIterable<AnswerEvent>): Promise<AnswerEvent[]> {
  const out: AnswerEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

async function passagesFor(q: string) {
  const deps = await fixtureSearchDeps();
  const res = await search({ q }, { ...deps, now: () => NOW });
  return selectPassages(res.items, res.query, deps.backend, STANDARD_SELECTION);
}

describe('passage selection (plan 7.4/1)', () => {
  it('wraps 10 to 20 passages with ids, metadata and a citation line', async () => {
    const ps = await passagesFor('kişisel verilerin silinmesi');
    expect(ps.length).toBeGreaterThanOrEqual(10);
    expect(ps.length).toBeLessThanOrEqual(20);
    expect(ps.map((p) => p.id)).toEqual(ps.map((_, i) => `K${i + 1}`));
    for (const p of ps) {
      expect(p.text.split('\n')[0]).toBe(
        kunye(
          fixtureRecords().find((r) => r.id === p.recordId)!,
          p.section,
        ),
      );
      expect(p.text).toBe(`${p.text.split('\n')[0]}\n${p.body}`);
      expect(p.dataDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(ps.reduce((s, p) => s + p.text.length, 0)).toBeLessThanOrEqual(STANDARD_SELECTION.maxChars);
  });

  it('puts the law number and the decision date into the citation line', () => {
    const recs = fixtureRecords();
    expect(kunye(recs.find((r) => r.title.includes('m.11 İlgili'))!)).toMatch(/^6698 sayılı Kişisel/);
    expect(kunye(recs.find((r) => r.esasNo === '2019/14037')!)).toMatch(/T\. 23\.03\.2022$/);
  });

  it('reads passages back from an Ek D prompt', () => {
    const prompt =
      '<soru>\nq\n</soru>\n<kaynaklar>\n<kaynak id="K1" tur="mevzuat" otorite="baglayici_norm" durum="yururlukte" tarih="2016-04-07" veri_gunu="2026-11-07">\nsatır bir\nsatır iki\n</kaynak>\n<kaynak id="K2" tur="karar" otorite="emsal" durum="bilinmiyor" tarih="" veri_gunu="2026-10-01">\nkarar metni\n</kaynak>\n</kaynaklar>';
    expect(passagesFromPrompt(prompt)).toEqual([
      {
        id: 'K1',
        text: 'satır bir\nsatır iki',
        body: 'satır iki',
        authority: 'baglayici_norm',
        status: 'yururlukte',
        fetchedAt: '2026-11-07T00:00:00.000Z',
        section: null,
      },
      {
        id: 'K2',
        text: 'karar metni',
        body: 'karar metni',
        authority: 'emsal',
        status: 'bilinmiyor',
        fetchedAt: '2026-10-01T00:00:00.000Z',
        section: null,
      },
    ]);
  });

  it('marks the decision section in the citation line and reads it back from the prompt', () => {
    const rec = fixtureRecords().find((r) => r.esasNo === '2018/20')!;
    expect(kunye(rec, 'karsi_oy')).toBe(`${kunye(rec)} (Bölüm: karşı oy)`);
    expect(sectionOfKunye(kunye(rec, 'iddia'))).toBe('iddia');
    expect(sectionOfKunye(kunye(rec))).toBeNull();
    const prompt = `<kaynak id="K1" tur="karar" otorite="baglayici_karar" durum="bilinmiyor" tarih="" veri_gunu="2026-11-07">\n${kunye(rec, 'karsi_oy')}\nÇoğunluğun görüşüne katılmıyorum.\n</kaynak>`;
    expect(passagesFromPrompt(prompt)[0]).toMatchObject({
      section: 'karsi_oy',
      body: 'Çoğunluğun görüşüne katılmıyorum.',
    });
  });

  it('labels passages of sectioned decisions', async () => {
    const ps = await passagesFor('unutulma hakkı kanun yararına bozma');
    const decision = ps.filter((p) => p.type === 'karar');
    expect(decision.length).toBeGreaterThan(0);
    expect(decision.some((p) => p.section !== null)).toBe(true);
    for (const p of decision.filter((x) => x.section))
      expect(p.text.split('\n')[0]).toMatch(/ \(Bölüm: [^)]+\)$/);
  });
});

describe('answer event stream (plan 7.4, Ek C.1 SSE)', () => {
  it('emits sources and fixed warnings first, then only validated sentences, then son', async () => {
    const ps = await passagesFor('KVKK m.11');
    const k1 = ps[0]!;
    expect(k1.title).toContain('m.11');
    const good: ModelLine = {
      t: 'cumle',
      metin: 'KVKK m.11 uyarınca herkes kişisel veri işlenip işlenmediğini öğrenebilir.',
      kaynaklar: [k1.id],
      alinti: { [k1.id]: 'Kişisel veri işlenip işlenmediğini öğrenme' },
    };
    const bad: ModelLine = { ...good, alinti: { [k1.id]: 'bu cümle kaynakta hiç geçmiyor' } };
    const progress: number[] = [];
    const events = await collect(
      answerEvents({
        requestId: 'r1',
        passages: ps,
        lines: from([good, null, bad, { t: 'son' }]),
        texts,
        now: NOW,
        onProgress: (s) => progress.push(s.accepted),
        settle: (s) => (s.accepted ? 2 : 0),
      }),
    );
    expect(events.map((e) => e.t)).toEqual(['kaynaklar', 'uyari', 'uyari', 'cumle', 'son']);
    expect(events[0]).toEqual({ t: 'kaynaklar', kaynaklar: sourceChips(ps) });
    expect(events[3]).toMatchObject({ t: 'cumle', index: 0, destekleyici: false, kaynaklar: [k1.id] });
    expect(events[4]).toEqual({ t: 'son', requestId: 'r1', creditsCharged: 2, droppedLines: 2 });
    expect(progress).toEqual([0, 1, 1, 1, 1]);
  });

  it('abstains when no sentence survives and charges nothing', async () => {
    const ps = await passagesFor('KVKK m.11');
    const events = await collect(
      answerEvents({
        requestId: 'r2',
        passages: ps,
        lines: from([{ t: 'yetersiz', neden: 'kaynaklar soruyu karşılamıyor' }, { t: 'son' }]),
        texts,
        now: NOW,
        settle: (s) => (s.abstained ? 0 : 2),
      }),
    );
    expect(events.slice(-2)).toEqual([
      { t: 'cekimser', metin: 'CEKIMSER', neden: 'kaynak_yetersiz' },
      { t: 'son', requestId: 'r2', creditsCharged: 0, droppedLines: 0 },
    ]);
  });

  it('abstains without sources and never shows model written reasons', async () => {
    const events = await collect(
      answerEvents({ requestId: 'r3', passages: [], lines: from([]), texts, now: NOW, settle: () => 0 }),
    );
    expect(events.map((e) => e.t)).toEqual(['kaynaklar', 'uyari', 'uyari', 'cekimser', 'son']);
    expect(
      abstainReason({
        accepted: 0,
        dropped: 2,
        words: 0,
        reasons: {},
        sawInsufficient: true,
        ended: true,
        abstained: true,
      }),
    ).toBe('dogrulanamadi');
    expect(
      abstainReason({
        accepted: 0,
        dropped: 0,
        words: 0,
        reasons: {},
        sawInsufficient: false,
        ended: true,
        abstained: true,
      }),
    ).toBe('cikti_yok');
  });
});
