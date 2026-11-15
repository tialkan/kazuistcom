/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  andTsQueryText,
  loadPromptPassages,
  OR_FALLBACK_BELOW,
  parseQuery,
  search,
  selectPassages,
  sqlBackend,
  STANDARD_SELECTION,
  type SqlClient,
} from '@kazuist/casuist';
import { fixtureRecords } from '@kazuist/casuist/fixture';
import { seedCorpus } from '@kazuist/casuist/testing';
import { schema } from '@/server/auth/db';

/** The PostgreSQL backend on the real schema (migrations of packages/db) with the fixture corpus seeded. */
let pg: PGlite;
let db: SqlClient;
const NOW = () => new Date('2026-11-07T12:00:00Z');

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg, { schema }), { migrationsFolder });
  db = pg as unknown as SqlClient;
  expect(await seedCorpus(db, fixtureRecords())).toBe(75);
}, 60_000);

describe('sqlBackend over PostgreSQL (turkish tsvector, chunks, citation count)', () => {
  it('finds by Turkish full text with title weight and returns the best chunk', async () => {
    const backend = sqlBackend(db);
    const hits = await backend.fullText(parseQuery('kişisel verilerin silinmesi'), {}, 100);
    expect(hits.length).toBeGreaterThan(5);
    const top3 = await backend.records(hits.slice(0, 3).map((h) => h.id));
    expect(top3.map((r) => r.title)).toContainEqual(
      expect.stringMatching(/Kanunu m\.7 Kişisel verilerin silinmesi/),
    );
    expect(hits[0]!.chunk?.recordId).toBe(hits[0]!.id);
    // ts_rank has no inverse document frequency; the fused score adds term coverage and puts m.7 first.
    const res = await search({ q: 'kişisel verilerin silinmesi' }, { backend, now: NOW });
    expect(res.items[0]?.record.title).toMatch(/Kanunu m\.7 Kişisel verilerin silinmesi/);
  });

  it('matches identity by esas and karar number and by article', async () => {
    const backend = sqlBackend(db);
    const byNo = await backend.identity(parseQuery('4. HD 2023/12295 E., 2025/14577 K.'), {}, 5);
    expect((await backend.records(byNo.map((h) => h.id)))[0]?.kararNo).toBe('2025/14577');
    const byNorm = await backend.identity(parseQuery('TBK 58'), {}, 5);
    const recs = await backend.records(byNorm.map((h) => h.id));
    expect(recs.map((r) => r.title)).toEqual([expect.stringMatching(/^Türk Borçlar Kanunu m\.58 /)]);
  });

  it('runs the full hybrid search and filters in SQL', async () => {
    const res = await search(
      { q: 'manevi tazminat', court: 'Genel Kurulu', from: '2010-01-01' },
      { backend: sqlBackend(db), now: NOW },
    );
    expect(res.degraded).toEqual(['vektor']);
    expect(res.items.length).toBeGreaterThan(0);
    for (const r of res.items) {
      expect(r.record.chamber).toBe('Hukuk Genel Kurulu');
      expect(r.record.date! >= '2010-01-01').toBe(true);
    }
  });

  it('never serves hidden or unmasked records (ADR-0023)', async () => {
    const backend = sqlBackend(db);
    const target = fixtureRecords().find((r) =>
      r.title.startsWith('Kişisel Verilerin Korunması Kanunu m.7 '),
    )!;
    await pg.query('UPDATE records SET hidden_at = now() WHERE id = $1', [target.id]);
    const hits = await backend.fullText(parseQuery('kişisel verilerin silinmesi'), {}, 100);
    expect(hits.map((h) => h.id)).not.toContain(target.id);
    expect(await backend.records([target.id])).toEqual([]);
    await pg.query('UPDATE records SET hidden_at = NULL, masked_text = NULL WHERE id = $1', [target.id]);
    expect(await backend.records([target.id])).toEqual([]);
    // Chunks went with masked_text (0004 trigger), so the full text leg cannot see it either.
    const after = await backend.fullText(parseQuery('kişisel verilerin silinmesi'), {}, 100);
    expect(after.map((h) => h.id)).not.toContain(target.id);
    await pg.query('UPDATE records SET masked_text = text WHERE id = $1', [target.id]);
  });

  it('falls back to on the fly passages when chunks are not written yet', async () => {
    const backend = sqlBackend(db);
    const target = fixtureRecords().find((r) =>
      r.title.startsWith('Kişisel Verilerin Korunması Kanunu m.7 '),
    )!;
    const ps = await backend.passages(parseQuery('silinmesi'), [target.id], 1);
    expect(ps).toHaveLength(1);
    expect(target.text.includes(ps[0]!.text)).toBe(true);
  });

  it('reloads the passages a BYOK bundle names: same text as selected, servable only (verify)', async () => {
    const backend = sqlBackend(db);
    const res = await search({ q: 'kişisel verilerin silinmesi' }, { backend, now: NOW });
    const selected = await selectPassages(res.items, res.query, backend, STANDARD_SELECTION);
    expect(selected.length).toBeGreaterThan(5);
    // m.7 lost its chunk rows in the test above, so at least one passage was built on the fly.
    expect(selected.some((p) => /:\d+$/.test(p.chunkId))).toBe(true);
    expect(selected.some((p) => !/:\d+$/.test(p.chunkId))).toBe(true);
    const refs = selected.map((p) => ({ id: p.id, recordId: p.recordId, chunkId: p.chunkId }));
    expect(await loadPromptPassages(backend, refs, STANDARD_SELECTION)).toEqual(selected);

    // A hidden record drops out; ids that are neither uuid nor on the fly are ignored without a cast error.
    const first = selected.find((p) => !/:\d+$/.test(p.chunkId))!;
    await pg.query('UPDATE records SET hidden_at = now() WHERE id = $1', [first.recordId]);
    const reloaded = await loadPromptPassages(backend, refs, STANDARD_SELECTION);
    expect(reloaded.map((p) => p.id)).not.toContain(first.id);
    expect(await backend.chunks([first.chunkId])).toEqual([]);
    await pg.query('UPDATE records SET hidden_at = NULL WHERE id = $1', [first.recordId]);
    expect(await backend.chunks(['yok', "x'; DROP TABLE chunks; --", `${first.recordId}:x`])).toEqual([]);
    // A chunk named under another record is not accepted.
    const other = selected.find((p) => p.recordId !== first.recordId)!;
    expect(
      await loadPromptPassages(backend, [{ id: 'K1', recordId: other.recordId, chunkId: first.chunkId }]),
    ).toEqual([]);
  });

  it('counts incoming citation edges for importance', async () => {
    const [a, b] = fixtureRecords().filter((r) => r.type === 'karar');
    await pg.query(
      `INSERT INTO citation_edges (from_record_id, to_record_id, to_raw, kind, confidence, extractor)
       VALUES ($1, $2, 'x', 'atif', 0.99, 'test')`,
      [a!.id, b!.id],
    );
    const [rec] = await sqlBackend(db).records([b!.id]);
    expect(rec?.citedByCount).toBe(1);
  });

  it('never counts rejected edges and keeps the confidence threshold (ADR-0035)', async () => {
    const target = fixtureRecords().filter((r) => r.type === 'karar')[2]!;
    const from = fixtureRecords()
      .filter((r) => r.id !== target.id)
      .slice(0, 7);
    expect(from).toHaveLength(7);
    // [confidence, confirmed, rejected, counted]
    const edges: [number, boolean, boolean, boolean][] = [
      [0.99, false, false, true], // extractor at least 0.90
      [0.9, false, false, true], // threshold is inclusive
      [0.6, true, false, true], // editor confirmed
      [0.6, false, false, false], // unconfirmed and below 0.90
      [0.99, false, true, false], // rejected outweighs high confidence
      [0.8, true, true, false], // rejected outweighs confirmation
      [0, true, false, false], // pre-v1.5 rejection form, not yet marked rejected
    ];
    for (const [i, [confidence, confirmed, rejected]] of edges.entries()) {
      await pg.query(
        `INSERT INTO citation_edges
           (from_record_id, to_record_id, to_raw, kind, confidence, confirmed, rejected, extractor)
         VALUES ($1, $2, 'red', 'atif', $3, $4, $5, 'test')`,
        [from[i]!.id, target.id, confidence, confirmed, rejected],
      );
    }
    const [rec] = await sqlBackend(db).records([target.id]);
    expect(rec?.citedByCount).toBe(edges.filter((e) => e[3]).length);
    expect(rec?.citedByCount).toBe(3);
    // An editor rejecting a counted edge removes it from the count.
    await pg.query(
      `UPDATE citation_edges SET rejected = true WHERE from_record_id = $1 AND to_record_id = $2`,
      [from[0]!.id, target.id],
    );
    const [after] = await sqlBackend(db).records([target.id]);
    expect(after?.citedByCount).toBe(2);
  });

  it('vector leg uses the HNSW cosine operator and keeps one hit per record', async () => {
    const r = fixtureRecords()[0]!;
    const v = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0));
    await pg.query(
      `UPDATE chunks SET embedding = $1::halfvec, embedding_model = 'test' WHERE record_id = $2`,
      [`[${v.join(',')}]`, r.id],
    );
    const hits = await sqlBackend(db).vector!(v, 'test', {}, 10);
    expect(hits.map((h) => h.id)).toEqual([r.id]);
    expect(hits[0]?.score).toBeCloseTo(1);
    expect(await sqlBackend(db).vector!(v, 'baska-model', {}, 10)).toEqual([]);
  });

  it('runs the AND query first and adds the OR query only when it finds fewer than 5 records', async () => {
    const and = sqlBackend(db);
    const or = sqlBackend(db, { fullText: 'or' });
    // Many records hold every word: the AND leg alone answers, and each hit holds both words.
    const q = parseQuery('kişisel veri');
    const both = await and.fullText(q, {}, 100);
    const any = await or.fullText(q, {}, 100);
    expect(both.length).toBeGreaterThanOrEqual(OR_FALLBACK_BELOW);
    expect(both.length).toBeLessThan(any.length);
    for (const r of await and.records(both.map((h) => h.id)))
      expect(`${r.title} ${r.text}`.toLocaleLowerCase('tr-TR')).toMatch(
        /kişisel[\s\S]*veri|veri[\s\S]*kişisel/,
      );
    // A rare word plus a common one: too few AND hits, so the OR hits follow the AND hits.
    const rare = parseQuery('unutulma tazminat');
    const andRare = await and.fullText(rare, {}, 100);
    const orRare = await or.fullText(rare, {}, 100);
    expect(andRare.length).toBe(orRare.length);
    expect(new Set(andRare.map((h) => h.id))).toEqual(new Set(orRare.map((h) => h.id)));
  });

  it('builds a safe websearch query: phrases kept, operators dropped', () => {
    expect(andTsQueryText(parseQuery('"açık rıza" KVKK\'nın m.11 -silme or x'))).toBe(
      '"açık rıza" kvkk 11 silme',
    );
    expect(andTsQueryText(parseQuery('<script> & | ! :*'))).toBe('script');
  });

  it('serves EU law as comparative even when an older ingest stored it as binding (plan Ek F)', async () => {
    const gdpr = fixtureRecords().find((r) => r.type === 'ab_hukuku')!;
    await pg.query(
      `UPDATE records SET authority_class = 'baglayici_norm', jurisdiction = 'EU' WHERE id = $1`,
      [gdpr.id],
    );
    const backend = sqlBackend(db);
    const [rec] = await backend.records([gdpr.id]);
    expect(rec?.authorityClass).toBe('karsilastirmali');
    const binding = await backend.fullText(parseQuery('personal data'), { authority: 'baglayici_norm' }, 100);
    expect(binding.map((h) => h.id)).not.toContain(gdpr.id);
    const comparative = await backend.fullText(
      parseQuery('personal data'),
      { authority: 'karsilastirmali' },
      100,
    );
    expect(comparative.map((h) => h.id)).toContain(gdpr.id);
    await pg.query(
      `UPDATE records SET authority_class = 'karsilastirmali', jurisdiction = 'AB' WHERE id = $1`,
      [gdpr.id],
    );
  });
});

/**
 * eval/rag on PostgreSQL: the 50 question set through sqlBackend (Turkish tsvector, no vector leg), recall of an
 * expected source in the first 10 for the earlier OR only full text leg and for AND first. Printed for the
 * measurement report; both must keep the plan 7.6 threshold of 85%.
 */
describe('eval/rag set-50 over PostgreSQL', () => {
  it('keeps recall@10 at or above 85% with AND first', async () => {
    const set = JSON.parse(
      readFileSync(new URL('../../../../../../eval/rag/set-50.json', import.meta.url), 'utf8'),
    ) as { sorular: { id: string; tur: string; soru: string; beklenen: string[] }[] };
    const raw = JSON.parse(
      readFileSync(
        new URL('../../../../../../packages/casuist/fixtures/kayitlar.json', import.meta.url),
        'utf8',
      ),
    ) as { kayitlar: { id: string; sourceKey: string }[] };
    const idOf = new Map(raw.kayitlar.map((r) => [r.sourceKey, r.id]));
    const answered = set.sorular.filter((s) => s.tur === 'cevapli');
    const recall = async (mode: 'or' | 'and_first') => {
      const backend = sqlBackend(db, { fullText: mode });
      let hit = 0;
      let rr = 0;
      const missed: string[] = [];
      for (const s of answered) {
        const res = await search({ q: s.soru, pageSize: 10 }, { backend, now: NOW });
        const want = new Set(s.beklenen.map((k) => idOf.get(k)));
        const at = res.items.findIndex((r) => want.has(r.record.id));
        if (at >= 0) {
          hit++;
          rr += 1 / (at + 1);
        } else missed.push(s.id);
      }
      const n = answered.length;
      return { recall10: Number((hit / n).toFixed(3)), mrr10: Number((rr / n).toFixed(3)), kacan: missed };
    };
    const or = await recall('or');
    const andFirst = await recall('and_first');
    // Questions the AND query answered on its own (at least OR_FALLBACK_BELOW records, no OR query).
    let andAlone = 0;
    for (const s of answered) {
      const a = await sqlBackend(db).fullText(parseQuery(s.soru), {}, 100);
      const o = await sqlBackend(db, { fullText: 'or' }).fullText(parseQuery(s.soru), {}, 100);
      if (a.length < o.length) andAlone++;
    }
    console.log(
      JSON.stringify({
        olcum: 'eval-rag-postgres',
        sorular: answered.length,
        or,
        and_first: andFirst,
        andAlone,
      }),
    );
    expect(andFirst.recall10).toBeGreaterThanOrEqual(0.85);
  }, 60_000);
});
