import { afterEach, describe, expect, it, vi } from 'vitest';
import { sentetikAg } from '../_alan/test-verisi.ts';
import { resetCasuistLimiter } from '@/app/ara/_sunucu/hiz';
import { MemoryRateLimitStore, RateLimiter } from '@/server/auth/rate-limit';
import { citationNetworkGet, filtreOku, recordNetworkGet } from './api.ts';
import { atifKaynagi, kaynagiDegistir, KaynakYok } from './kaynak.ts';
import { ornekKaynagi } from './ornek.ts';
import { disAtifa, kararKosulu, likeKacis, sqlKaynagi, YAYIN_ESIGI } from './sql.ts';

vi.mock('@/server/auth/context', () => ({ getAuthContext: async () => ({}) }));

const istek = (yol: string) =>
  new Request(`http://localhost${yol}`, { headers: { 'x-forwarded-for': '203.0.113.7' } });

afterEach(() => {
  kaynagiDegistir(undefined);
  resetCasuistLimiter(undefined);
});

describe('query parsing', () => {
  it('reads filters, ignores empty form fields, rejects unknown, repeated or invalid values', () => {
    expect(filtreOku(new URL('http://x/?court=Yarg%C4%B1tay&from=2013&to='))).toEqual({
      ok: true,
      filtre: { court: 'Yargıtay', from: '2013' },
    });
    expect(filtreOku(new URL('http://x/?x=1')).ok).toBe(false);
    expect(filtreOku(new URL('http://x/?court=a&court=b')).ok).toBe(false);
    expect(filtreOku(new URL('http://x/?from=13')).ok).toBe(false);
  });
});

describe('SQL conditions', () => {
  it('defaults to the 1.0 scope and always requires a servable record', () => {
    const { where, params } = kararKosulu({});
    expect(where).toContain('r.masked_text IS NOT NULL');
    expect(where).toContain('r.hidden_at IS NULL');
    expect(where).toContain('hukuk genel kurulu|birleştirme');
    expect(where).toContain('Anayasa Mahkemesi');
    expect(params).toEqual([]);
  });
  it('uses placeholders for every filter value and escapes LIKE wildcards', () => {
    const { where, params } = kararKosulu({
      court: 'Yarg%ıtay',
      chamber: 'a_b',
      from: '2013',
      to: '2015',
      topic: "x'; drop table records;--",
    });
    expect(where).not.toContain('drop table');
    expect(params).toEqual([
      'Yarg\\%ıtay%',
      '%a\\_b%',
      '2013-01-01',
      '2015-12-31',
      "%x'; drop table records;--%",
    ]);
    expect(likeKacis('50%_\\')).toBe('50\\%\\_\\\\');
  });
  it('only edges above the threshold or confirmed are read, rejections are hidden', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    };
    const ag = await sqlKaynagi(pool as never).ag({});
    expect(ag.nodes).toEqual([]);
    expect(ag.meta).toMatchObject({ kaynak: 'veritabani', yayinEsigi: YAYIN_ESIGI });
    const edgeQuery = calls.find((c) => c.sql.includes('citation_edges'));
    expect(edgeQuery).toBeUndefined(); // no decisions, no further queries
  });
  it('a missing work table (schema request pending) means no doctrine data, not an error', async () => {
    const kayit = {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'karar',
      title: 'T',
      court: 'Yargıtay',
      chamber: 'Hukuk Genel Kurulu',
      esas_no: '1/1',
      karar_no: '1/2',
      date: '2015-01-01',
      authority_class: 'yuksek_emsal',
      status: 'bilinmiyor',
      source_url: 'https://x.invalid',
      fetched_at: null,
    };
    const pool = {
      query: async (sql: string) => {
        if (sql.includes('work_citations')) throw Object.assign(new Error('x'), { code: '42P01' });
        if (sql.includes('FROM records r WHERE r.hidden_at')) return { rows: [kayit] };
        if (sql.includes('review_queue')) return { rows: [{ n: '3' }] };
        return { rows: [] };
      },
    };
    const ag = await sqlKaynagi(pool as never).ag({});
    expect(ag.nodes).toHaveLength(1);
    expect(ag.meta).toMatchObject({ doktrinVerisi: false, kuyrukta: 3 });
  });
  it('splits to_raw back into an external citation', () => {
    expect(disAtifa('k', '2014/4-56|2015/1679')).toMatchObject({
      tur: 'yargi',
      esasNo: '2014/4-56',
      kararNo: '2015/1679',
    });
    expect(disAtifa('k', 'C-131/12')).toMatchObject({ tur: 'abad', numara: 'C-131/12' });
    expect(disAtifa('k', '12345/09')).toMatchObject({ tur: 'aihm' });
    expect(disAtifa('k', '2014/18260')).toMatchObject({ tur: 'aym', mahkeme: 'Anayasa Mahkemesi' });
  });
});

describe('source choice', () => {
  it('never serves the example source in production', () => {
    expect(() => atifKaynagi({ NODE_ENV: 'production', KAZUIST_ARAMA_KAYNAGI: 'fikstur' })).toThrow(
      KaynakYok,
    );
    expect(() => atifKaynagi({ NODE_ENV: 'production' })).toThrow(KaynakYok);
    expect(atifKaynagi({ NODE_ENV: 'development' })).toBe(ornekKaynagi);
    expect(
      atifKaynagi({
        NODE_ENV: 'production',
        KAZUIST_ARAMA_KAYNAGI: 'fikstur',
        KAZUIST_FIKSTUR_URETIMDE: '1',
      }),
    ).toBe(ornekKaynagi);
  });
});

describe('example source over the real decisions', () => {
  it('scopes to HGK by default and finds the doctrine edges of the real HGK decision', async () => {
    const ag = await ornekKaynagi.ag({});
    expect(ag.meta.kaynak).toBe('fikstur');
    expect(ag.nodes.map((n) => n.chamber)).toEqual([
      'Hukuk Genel Kurulu',
      'Hukuk Genel Kurulu',
      'Hukuk Genel Kurulu',
    ]);
    expect(ag.works.map((w) => w.yazarlar[0]).sort()).toEqual([
      'Akipek, Jale Güral',
      'Köprülü, Bülent',
      'Uygur, Turgut',
      'İmre, Zahit',
    ]);
    expect(ag.summary).toMatchObject({ kararSayisi: 3, eserSayisi: 4, doktrinAtfiSayisi: 4 });
    expect(ag.externalCitations.length).toBe(3); // 2. HD x2 and 4. HD cited by the HGK decisions
  });
  it('filters by chamber, year and title, and the whole scope when asked for Yargıtay', async () => {
    expect((await ornekKaynagi.ag({ court: 'Yargıtay' })).nodes).toHaveLength(7);
    expect((await ornekKaynagi.ag({ court: 'Yargıtay', chamber: 'Ceza Genel' })).nodes).toHaveLength(0);
    expect((await ornekKaynagi.ag({ from: '2012', to: '2012' })).nodes).toHaveLength(1);
    expect((await ornekKaynagi.ag({ topic: '2012/4-179' })).nodes).toHaveLength(1);
    expect((await ornekKaynagi.ag({ court: 'Anayasa Mahkemesi' })).nodes).toHaveLength(0);
  });
});

describe('API handlers', () => {
  it('GET /v1/citation-network returns the contract graph plus the additive fields', async () => {
    resetCasuistLimiter(new RateLimiter(new MemoryRateLimitStore()));
    kaynagiDegistir({ ag: async () => sentetikAg(), kayitAgi: async () => null });
    const res = await citationNetworkGet(istek('/api/v1/citation-network?court=Yarg%C4%B1tay'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    const body = await res.json();
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining([
        'nodes',
        'edges',
        'works',
        'workEdges',
        'externalCitations',
        'summary',
        'meta',
      ]),
    );
    expect(body.edges[0]).toEqual({ from: 'k2', to: 'k1', kind: 'atif' });
  });
  it('rejects bad filters with 400 and hides internals on failure', async () => {
    resetCasuistLimiter(new RateLimiter(new MemoryRateLimitStore()));
    expect((await citationNetworkGet(istek('/api/v1/citation-network?from=abc'))).status).toBe(400);
    kaynagiDegistir({
      ag: async () => Promise.reject(new Error('connection string postgres://secret')),
      kayitAgi: async () => null,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await citationNetworkGet(istek('/api/v1/citation-network'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
  it('GET /v1/records/:id/network: 404 for a bad or unknown id, 200 for a known one', async () => {
    resetCasuistLimiter(new RateLimiter(new MemoryRateLimitStore()));
    const id = '00000000-0000-4000-8000-000000000001';
    kaynagiDegistir({
      ag: async () => sentetikAg(),
      kayitAgi: async (x) => (x === id ? sentetikAg(2, 2) : null),
    });
    const ctx = (v: string) => ({ params: Promise.resolve({ id: v }) });
    expect((await recordNetworkGet(istek('/x'), ctx('not-a-uuid'))).status).toBe(404);
    expect((await recordNetworkGet(istek('/x'), ctx('00000000-0000-4000-8000-000000000009'))).status).toBe(
      404,
    );
    expect((await recordNetworkGet(istek('/x'), ctx(id))).status).toBe(200);
  });
  it('is rate limited per client IP', async () => {
    resetCasuistLimiter(new RateLimiter(new MemoryRateLimitStore()));
    kaynagiDegistir({ ag: async () => sentetikAg(), kayitAgi: async () => null });
    let son = 200;
    for (let i = 0; i < 61; i++) son = (await citationNetworkGet(istek('/api/v1/citation-network'))).status;
    expect(son).toBe(429);
  });
});
