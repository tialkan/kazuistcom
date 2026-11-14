/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseQuery, search, sqlBackend, type SqlClient } from '@kazuist/casuist';
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
});
