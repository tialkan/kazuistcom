/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions on known fixtures */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedCorpus, type SqlClient } from '@kazuist/casuist';
import { fixtureRecords } from '@kazuist/casuist/fixture';
import { api, createHarness, params, signUp, type Harness } from '@/server/auth/__tests__/harness';
import { MemoryRateLimitStore, RateLimiter } from '@/server/auth/rate-limit';
import {
  decodeCursor,
  encodeCursor,
  libraryDelete,
  libraryExportGet,
  libraryGet,
  libraryPost,
} from './kutuphane.ts';

let h: Harness;
let a: string;
let b: string;
const recs = fixtureRecords();
const kvkk11 = recs.find((r) => r.title.startsWith('Kişisel Verilerin Korunması Kanunu m.11 '))!;
const hgk = recs.find((r) => r.esasNo === '2018/20')!;
const ORIGIN = { origin: 'http://localhost:3000' };

const add = (token: string, body: unknown) =>
  libraryPost(api('/v1/library', token, { method: 'POST', body: JSON.stringify(body), headers: ORIGIN }));

beforeAll(async () => {
  h = await createHarness();
  await seedCorpus(h.pg as unknown as SqlClient, recs);
  a = (await signUp('kutuphane-a@example.com')).token;
  b = (await signUp('kutuphane-b@example.com')).token;
}, 60_000);
beforeEach(() => {
  h.ctx.limiter = new RateLimiter(new MemoryRateLimitStore());
});

describe('/v1/library (FR-23..25)', () => {
  it('needs a session', async () => {
    expect((await libraryGet(api('/v1/library', null))).status).toBe(401);
  });

  it('saves, lists newest first, rejects duplicates and unknown records', async () => {
    const r1 = await add(a, { recordId: kvkk11.id, note: 'tez bölüm 2' });
    expect(r1.status).toBe(201);
    expect(await r1.json()).toMatchObject({ recordId: kvkk11.id, note: 'tez bölüm 2' });
    expect((await add(a, { recordId: hgk.id })).status).toBe(201);
    expect((await add(a, { recordId: kvkk11.id })).status).toBe(409);
    expect((await add(a, { recordId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
    expect((await add(a, { recordId: kvkk11.id, extra: 1 })).status).toBe(400);
    const list = await (await libraryGet(api('/v1/library', a))).json();
    expect(list.items.map((i: { recordId: string }) => i.recordId)).toEqual([hgk.id, kvkk11.id]);
    expect(list.nextCursor).toBeNull();
    expect(Object.keys(list.items[0]).sort()).toEqual(['createdAt', 'id', 'note', 'recordId']);
  });

  it('keeps users apart: another user cannot list or delete the item (IDOR)', async () => {
    const mine = await (await libraryGet(api('/v1/library', a))).json();
    const id = mine.items[0].id as string;
    expect((await (await libraryGet(api('/v1/library', b))).json()).items).toEqual([]);
    const other = await libraryDelete(
      api(`/v1/library/${id}`, b, { method: 'DELETE', headers: ORIGIN }),
      params({ id }),
    );
    expect(other.status).toBe(404);
    expect((await (await libraryGet(api('/v1/library', a))).json()).items).toHaveLength(2);
  });

  it('exports RIS and BibTeX as text files and refuses unchecked styles', async () => {
    const ris = await libraryExportGet(api('/v1/library/export?format=ris', a));
    expect(ris.status).toBe(200);
    expect(ris.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(ris.headers.get('content-disposition')).toBe('attachment; filename="kaydettiklerim.ris"');
    const text = await ris.text();
    expect(text).toContain('TY  - CASE');
    expect(text).toContain('TY  - STAT');
    expect(text).toContain('N1  - tez bölüm 2');
    const bib = await libraryExportGet(api('/v1/library/export?format=bibtex', a));
    expect(await bib.text()).toContain('@misc{');
    const isnad = await libraryExportGet(api('/v1/library/export?format=isnad-dipnotlu', a));
    expect(isnad.status).toBe(400);
    expect((await libraryExportGet(api('/v1/library/export?format=pdf', a))).status).toBe(400);
  });

  it('drops a record hidden by a takedown from the list and the export', async () => {
    await h.pg.query('UPDATE records SET hidden_at = now() WHERE id = $1', [hgk.id]);
    const list = await (await libraryGet(api('/v1/library', a))).json();
    expect(list.items.map((i: { recordId: string }) => i.recordId)).toEqual([kvkk11.id]);
    expect(await (await libraryExportGet(api('/v1/library/export?format=ris', a))).text()).not.toContain(
      '2018/20',
    );
    await h.pg.query('UPDATE records SET hidden_at = NULL WHERE id = $1', [hgk.id]);
  });

  it('pages with an opaque cursor and rejects a forged one', async () => {
    const bad = await libraryGet(api('/v1/library?cursor=bm90LWEtY3Vyc29y', a));
    expect(bad.status).toBe(400);
    const c = encodeCursor('2026-11-07T10:00:00.000Z', kvkk11.id);
    expect(decodeCursor(c)).toEqual({ at: new Date('2026-11-07T10:00:00.000Z'), id: kvkk11.id });
  });

  it('deletes the own item with 204 and a cross origin write is refused', async () => {
    const mine = await (await libraryGet(api('/v1/library', a))).json();
    const id = mine.items[0].id as string;
    const cross = await libraryDelete(
      new Request(`http://localhost:3000/api/v1/library/${id}`, {
        method: 'DELETE',
        headers: { cookie: 'x=1', origin: 'https://kotu.example', 'x-forwarded-for': '10.1.1.1' },
      }),
      params({ id }),
    );
    expect([401, 403]).toContain(cross.status);
    const del = await libraryDelete(
      api(`/v1/library/${id}`, a, { method: 'DELETE', headers: ORIGIN }),
      params({ id }),
    );
    expect(del.status).toBe(204);
  });
});
