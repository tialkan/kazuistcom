/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fixtureRecords } from '@kazuist/casuist/fixture';
import { normsGet, recordGet, searchGet } from './arama.ts';
import { corpusSource, setSearchDeps, SearchUnavailable } from './baglam.ts';
import { resetCasuistLimiter } from './hiz.ts';

const BASE = 'http://localhost:3000/api/v1';
let ipSeq = 0;
const get = (path: string, ip = `10.9.0.${++ipSeq % 250}`) =>
  new Request(`${BASE}${path}`, { headers: { 'x-forwarded-for': ip } });
const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });

const saved = { ...process.env };
beforeAll(() => {
  process.env.KAZUIST_ARAMA_KAYNAGI = 'fikstur';
  process.env.TRUSTED_PROXY_COUNT = '1';
  delete process.env.VALKEY_URL;
  setSearchDeps(undefined);
});
afterAll(() => {
  process.env = saved;
});
beforeEach(() => resetCasuistLimiter());

describe('GET /v1/search', () => {
  it('answers the contract shape with the identity match first', async () => {
    const res = await searchGet(get('/search?q=KVKK%20m.11'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['items', 'live', 'page', 'resolvedNorms', 'total']);
    expect(body.items[0].title).toMatch(/m\.11 İlgili kişinin hakları/);
    expect(body.resolvedNorms).toEqual([
      {
        kanunNo: '6698',
        kanunAdi: 'Kişisel Verilerin Korunması Kanunu',
        madde: '11',
        fikra: null,
        bent: null,
        recordId: null,
      },
    ]);
    expect(body.items[0]).not.toHaveProperty('text');
  });

  it('applies filters and pagination parameters', async () => {
    const res = await searchGet(
      get('/search?q=manevi%20tazminat&type=karar&sort=tarih_yeni&page=1&from=2010-01-01'),
    );
    const body = await res.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(
      body.items.every((i: { type: string; date: string }) => i.type === 'karar' && i.date >= '2010-01-01'),
    ).toBe(true);
  });

  it.each([
    ['/search', 'missing q'],
    ['/search?q=a&type=roman', 'unknown type'],
    ['/search?q=a&page=99', 'page above 50'],
    ['/search?q=a&from=07.11.2026', 'non ISO date'],
    ['/search?q=a&hack=1', 'unknown parameter'],
    [`/search?q=${'a'.repeat(501)}`, 'query too long'],
  ])('rejects %s (%s) with the error body', async (path) => {
    const res = await searchGet(get(path));
    expect(res.status).toBe(400);
    expect(Object.keys(await res.json()).sort()).toEqual(['code', 'message', 'requestId']);
  });

  it('rate limits per client IP', async () => {
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await searchGet(get('/search?q=veri', '10.8.8.8'))).status;
    expect(last).toBe(429);
    expect((await searchGet(get('/search?q=veri', '10.8.8.9'))).status).toBe(200);
  });
});

describe('GET /v1/records/:id', () => {
  it('returns the servable record with its official source', async () => {
    const r = fixtureRecords().find((x) => x.esasNo === '2019/14037')!;
    const res = await recordGet(get(`/records/${r.id}`), params({ id: r.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: r.id,
      esasNo: '2019/14037',
      sourceUrl: r.sourceUrl,
      jurisdiction: 'TR',
    });
    expect(body.text).toBe(r.text);
  });
  it('is 404 for unknown and malformed ids', async () => {
    expect((await recordGet(get('/records/x'), params({ id: 'x' }))).status).toBe(404);
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await recordGet(get(`/records/${id}`), params({ id }))).status).toBe(404);
  });
});

describe('GET /v1/norms/resolve', () => {
  it('resolves and links the article record when the corpus has it', async () => {
    const res = await normsGet(get('/norms/resolve?ref=TBK%2049%20ve%20GDPR%20Art.%2017'));
    const body = await res.json();
    const tbk = fixtureRecords().find((x) => x.title.startsWith('Türk Borçlar Kanunu m.49 '))!;
    expect(body).toEqual([
      expect.objectContaining({ kanunNo: '6098', madde: '49', recordId: tbk.id }),
      expect.objectContaining({ kanunNo: 'GDPR', madde: '17', recordId: null }),
    ]);
    expect((await normsGet(get('/norms/resolve'))).status).toBe(400);
  });
});

describe('corpus source selection', () => {
  it('never serves the fixture in production unless explicitly allowed', () => {
    expect(() => corpusSource({ NODE_ENV: 'production', KAZUIST_ARAMA_KAYNAGI: 'fikstur' })).toThrow(
      SearchUnavailable,
    );
    expect(() => corpusSource({ NODE_ENV: 'production' })).toThrow(SearchUnavailable);
    expect(corpusSource({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })).toBe('veritabani');
    expect(corpusSource({ NODE_ENV: 'development' })).toBe('fikstur');
  });
});
