/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { describe, expect, it } from 'vitest';
import { fixtureRecords, fixtureSearchDeps } from '../src/fixture.ts';
import { MemoryBackend } from '../src/memory.ts';
import { search, type LiveSource } from '../src/search.ts';
import { toApiRecord, toSearchResponse, toSummary } from '../src/api.ts';
import type { CorpusRecord } from '../src/types.ts';

const NOW = () => new Date('2026-11-07T12:00:00Z');

describe('hybrid search over the fixture corpus (plan 7.2)', () => {
  it('puts the identity match first: article reference', async () => {
    const deps = await fixtureSearchDeps();
    const res = await search({ q: 'KVKK m.11' }, { ...deps, now: NOW });
    expect(res.items[0]?.record.title).toMatch(/^Kişisel Verilerin Korunması Kanunu m\.11 /);
    expect(res.items[0]?.identity).toBe(true);
    expect(res.items[0]?.legs).toContain('kimlik');
    expect(res.query.norms[0]).toMatchObject({ kanunNo: '6698', madde: '11' });
  });

  it('puts the identity match first: esas and karar number', async () => {
    const deps = await fixtureSearchDeps();
    const res = await search({ q: 'E. 2019/14037 K. 2022/2232' }, { ...deps, now: NOW });
    expect(res.items[0]?.record).toMatchObject({ esasNo: '2019/14037', kararNo: '2022/2232' });
    expect(res.items[0]?.relevance).toBe(1);
  });

  it('fuses full text and vector legs and finds text without Turkish letters', async () => {
    const deps = await fixtureSearchDeps();
    const res = await search({ q: 'ozel nitelikli kisisel veri' }, { ...deps, now: NOW });
    const titles = res.items.map((r) => r.record.title);
    expect(titles.some((t) => t.includes('m.6 Özel nitelikli'))).toBe(true);
    expect(res.items[0]?.legs).toEqual(expect.arrayContaining(['tam_metin', 'vektor']));
    expect(res.degraded).toEqual([]);
  });

  it('counts per type before the type filter and filters by type (FR-09)', async () => {
    const deps = await fixtureSearchDeps();
    const all = await search({ q: 'kişisel verilerin silinmesi' }, { ...deps, now: NOW });
    const karar = await search({ q: 'kişisel verilerin silinmesi', type: 'karar' }, { ...deps, now: NOW });
    expect(karar.counts).toEqual(all.counts);
    expect(karar.total).toBe(all.counts.karar);
    expect(karar.items.every((r) => r.record.type === 'karar')).toBe(true);
  });

  it('filters by date, court and authority class', async () => {
    const deps = await fixtureSearchDeps();
    const res = await search(
      { q: 'manevi tazminat', court: 'hukuk genel kurulu', from: '2010-01-01', authority: 'yuksek_emsal' },
      { ...deps, now: NOW },
    );
    expect(res.items.length).toBeGreaterThan(0);
    for (const r of res.items) {
      expect(r.record.chamber).toBe('Hukuk Genel Kurulu');
      expect(r.record.date! >= '2010-01-01').toBe(true);
      expect(r.record.authorityClass).toBe('yuksek_emsal');
    }
  });

  it('sorts by importance and by date, undated records last', async () => {
    const deps = await fixtureSearchDeps();
    const byImportance = await search({ q: 'kişilik hakkı', sort: 'onem' }, { ...deps, now: NOW });
    const imp = byImportance.items.map((r) => r.importance);
    expect(imp).toEqual([...imp].sort((a, b) => b - a));
    const newest = await search(
      { q: 'kişilik hakkı', sort: 'tarih_yeni', pageSize: 50 },
      { ...deps, now: NOW },
    );
    const dates = newest.items.map((r) => r.record.date ?? '');
    expect(dates.filter(Boolean)).toEqual([...dates.filter(Boolean)].sort().reverse());
    const oldest = await search(
      { q: 'kişilik hakkı', sort: 'tarih_eski', pageSize: 50 },
      { ...deps, now: NOW },
    );
    const d2 = oldest.items.map((r) => r.record.date ?? '');
    expect(d2.filter(Boolean)).toEqual([...d2.filter(Boolean)].sort());
  });

  it('paginates', async () => {
    const deps = await fixtureSearchDeps();
    const p1 = await search({ q: 'kişisel veri', pageSize: 5 }, { ...deps, now: NOW });
    const p2 = await search({ q: 'kişisel veri', pageSize: 5, page: 2 }, { ...deps, now: NOW });
    expect(p1.items).toHaveLength(5);
    expect(p2.page).toBe(2);
    expect(p2.items.map((r) => r.record.id)).not.toContain(p1.items[0]?.record.id);
  });

  it('runs without the vector leg and reports it as degraded', async () => {
    const backend = new MemoryBackend(fixtureRecords());
    const res = await search({ q: 'unutulma hakkı' }, { backend, now: NOW });
    expect(res.degraded).toEqual(['vektor']);
    expect(res.items[0]?.record.title).toContain('4. Hukuk Dairesi');
  });

  it('adds live results within the time budget and drops late ones (FR-83)', async () => {
    const deps = await fixtureSearchDeps();
    const liveRecord: CorpusRecord = { ...fixtureRecords()[0]!, id: '00000000-0000-4000-8000-000000000001' };
    const fast: LiveSource = { name: 'hizli', search: async () => [liveRecord] };
    const slow: LiveSource = {
      name: 'yavas',
      search: (_q, signal) =>
        new Promise((resolve, reject) => {
          const t = setTimeout(
            () => resolve([{ ...liveRecord, id: '00000000-0000-4000-8000-000000000002' }]),
            5_000,
          );
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new Error('aborted'));
          });
        }),
    };
    const seen: string[] = [];
    const res = await search(
      { q: 'kişisel veri' },
      { ...deps, now: NOW, live: [fast, slow], mask: (q) => (seen.push(q), '[maskeli]') },
    );
    expect(res.live.map((r) => r.record.id)).toEqual([liveRecord.id]);
    expect(res.live[0]?.labels).toContain('canli_kaynak');
    expect(res.timings.liveMs).toBeLessThan(2_000);
    expect(seen).toEqual(['kişisel veri']);
  }, 10_000);

  it('maps to the contract shapes without raw text in the summary', async () => {
    const deps = await fixtureSearchDeps();
    const res = await search({ q: 'TBK 49' }, { ...deps, now: NOW });
    const body = toSearchResponse(res);
    expect(body).toMatchObject({
      page: 1,
      total: res.total,
      resolvedNorms: [{ kanunNo: '6098', madde: '49' }],
    });
    const s = toSummary(res.items[0]!);
    expect(Object.keys(s).sort()).toEqual(
      [
        'authorityClass',
        'chamber',
        'court',
        'date',
        'esasNo',
        'fetchedAt',
        'id',
        'kararNo',
        'labels',
        'liveOnly',
        'snippet',
        'status',
        'title',
        'type',
      ].sort(),
    );
    const rec = toApiRecord(res.items[0]!.record, NOW());
    expect(rec.sourceUrl).toMatch(/^https:\/\/www\.mevzuat\.gov\.tr\//);
    expect(rec.normRefs?.[0]).toMatchObject({
      kanunNo: '6098',
      madde: '49',
      kanunAdi: 'Türk Borçlar Kanunu',
    });
  });
});
