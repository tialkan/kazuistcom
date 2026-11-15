import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffReady } from '../account-view.ts';
import { listCitationQueue } from '../citation-queue.ts';
import { resolvePrincipal } from '../guard.ts';
import { schema } from '../db.ts';
import { adminQueueDecide, adminQueueGet } from '../handlers.ts';
import { api, createHarness, params, signUp, staffUser, type Harness } from './harness.ts';

/**
 * Citation review queue (contract v1.5, ADR-0035; mimar-yonlendirme-3 kimlik madde 4): onay writes
 * confirmed = true, ret writes rejected = true, both behind the admin guard (staff role, passkey session, TOTP).
 */

let h: Harness;
let editor: { token: string; id: string };
const body = async (r: Response) => JSON.parse(await r.text());
/** First row of an insert ... returning, or a test failure. */
function one<T>(rows: T[]): T {
  const [r] = rows;
  if (!r) throw new Error('insert returned no row');
  return r;
}
const decide = (token: string | null, itemId: string, data: unknown) =>
  adminQueueDecide(
    api(`/v1/admin/queues/citations/${itemId}/decision`, token, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    params({ queue: 'citations', itemId }),
  );

async function record(title: string): Promise<string> {
  const [r] = await h.db
    .insert(schema.records)
    .values({
      type: 'karar',
      title,
      court: 'Yargıtay',
      esasNo: '2020/1',
      kararNo: '2021/2',
      authorityClass: 'yuksek_emsal',
      licenseBasis: 'test',
      sourceUrl: 'https://example.invalid/karar',
      sourceKey: `test:${title}`,
      fetchedAt: new Date(),
      text: 'metin',
    })
    .returning({ id: schema.records.id });
  if (!r) throw new Error('record insert failed');
  return r.id;
}

/** One karar candidate as citations/store.py writes it: an unconfirmed edge plus a queue item pointing at it. */
async function kararCandidate(from: string, to: string, toRaw: string, confidence = 0.8) {
  const edge = one(
    await h.db
      .insert(schema.citationEdges)
      .values({ fromRecordId: from, toRecordId: to, toRaw, confidence, extractor: 'test' })
      .returning({ id: schema.citationEdges.id }),
  );
  const [item] = await h.db
    .insert(schema.reviewQueueItems)
    .values({
      queue: 'citations',
      subjectType: 'citation_edge',
      subjectId: edge.id,
      priority: 10,
      payload: {
        recordId: from,
        kind: 'karar',
        confidence,
        reasons: ['tek_aday'],
        context: 'Yargıtay [esas] sayılı kararında',
        candidate: { kind: 'yargitay', esas: '2019/5', karar: '2019/6', toRecordId: to, toRaw },
      },
    })
    .returning({ id: schema.reviewQueueItems.id });
  if (!item) throw new Error('queue insert failed');
  return { edgeId: edge.id, itemId: item.id };
}

async function doktrinCandidate(from: string, key: string) {
  const work = one(
    await h.db
      .insert(schema.works)
      .values({ workKey: key, title: 'Borçlar Hukuku Genel Hükümler', authors: ['Yazar, Ad'] })
      .returning({ id: schema.works.id }),
  );
  const wc = one(
    await h.db
      .insert(schema.workCitations)
      .values({ fromRecordId: from, workId: work.id, pages: ['s. 12'], confidence: 0.7, extractor: 'test' })
      .returning({ id: schema.workCitations.id }),
  );
  const [item] = await h.db
    .insert(schema.reviewQueueItems)
    .values({
      queue: 'citations',
      subjectType: 'citation_edge',
      subjectId: wc.id,
      priority: 20,
      payload: {
        recordId: from,
        kind: 'doktrin',
        confidence: 0.7,
        reasons: ['yazar_eslesti'],
        context: 'Yazar, Borçlar Hukuku, s. 12',
        candidate: {
          work: { key, title: 'Borçlar Hukuku Genel Hükümler', authors: ['Yazar, Ad'] },
          pages: ['s. 12'],
        },
      },
    })
    .returning({ id: schema.reviewQueueItems.id });
  if (!item) throw new Error('queue insert failed');
  return { wcId: wc.id, itemId: item.id };
}

const edge = async (id: string) =>
  (await h.db.select().from(schema.citationEdges).where(eq(schema.citationEdges.id, id)))[0];
const workCitation = async (id: string) =>
  (await h.db.select().from(schema.workCitations).where(eq(schema.workCitations.id, id)))[0];
const queueItem = async (id: string) =>
  (await h.db.select().from(schema.reviewQueueItems).where(eq(schema.reviewQueueItems.id, id)))[0];

beforeAll(async () => {
  h = await createHarness();
  editor = await staffUser(h, 'atif-editor@example.invalid', 'editor');
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

describe('citation queue: authorisation', () => {
  it('misafir 401, kullanici 403, editor without the second step 403', async () => {
    const from = await record('Yetki kaynağı');
    const to = await record('Yetki hedefi');
    const { itemId, edgeId } = await kararCandidate(from, to, 'yetki-1');
    const user = await signUp('atif-kullanici@example.invalid');
    const noStep = await staffUser(h, 'atif-adimsiz@example.invalid', 'editor', false);
    for (const [token, status] of [
      [null, 401],
      [user.token, 403],
      [noStep.token, 403],
    ] as const) {
      expect((await decide(token, itemId, { decision: 'onay' })).status).toBe(status);
      const list = await adminQueueGet(
        api('/v1/admin/queues/citations', token),
        params({ queue: 'citations' }),
      );
      expect(list.status).toBe(status);
    }
    expect((await edge(edgeId))?.confirmed).toBe(false);
    expect((await queueItem(itemId))?.decision).toBeNull();
  });

  it('the editor screen uses the same gate (staffReady)', async () => {
    const who = async (token: string) => {
      const p = await resolvePrincipal(api('/v1/me', token), h.ctx);
      if (!p) throw new Error('no principal');
      return staffReady(h.ctx, p);
    };
    const user = await signUp('atif-ekran-kullanici@example.invalid');
    const noStep = await staffUser(h, 'atif-ekran-adimsiz@example.invalid', 'editor', false);
    expect(await who(user.token)).toEqual({ staff: false, ready: false });
    expect(await who(noStep.token)).toEqual({ staff: true, ready: false });
    expect(await who(editor.token)).toEqual({ staff: true, ready: true });
  });
});

describe('citation queue: decisions', () => {
  it('onay sets confirmed = true and closes the item', async () => {
    const from = await record('Onay kaynağı');
    const to = await record('Onay hedefi');
    const { itemId, edgeId } = await kararCandidate(from, to, 'onay-1');
    const list = await body(
      await adminQueueGet(api('/v1/admin/queues/citations', editor.token), params({ queue: 'citations' })),
    );
    expect(list.map((i: { id: string }) => i.id)).toContain(itemId);
    const r = await decide(editor.token, itemId, { decision: 'onay', note: 'Doğru karar.' });
    expect(r.status).toBe(200);
    const e = await edge(edgeId);
    expect(e).toMatchObject({ confirmed: true, rejected: false });
    expect(e?.confidence).toBeCloseTo(0.8);
    expect(await queueItem(itemId)).toMatchObject({ decision: 'onay', decidedBy: editor.id });
    const [audit] = await h.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, 'admin.queue.onay'), eq(schema.auditLog.subjectId, itemId)));
    expect(audit?.actorId).toBe(editor.id);
    expect(audit?.diff).toMatchObject({ queue: 'citations', kind: 'karar', edgeId, applied: true });
  });

  it('ret sets rejected = true, keeps confirmed false and the confidence (no pre v1.5 confidence = 0)', async () => {
    const from = await record('Ret kaynağı');
    const to = await record('Ret hedefi');
    const { itemId, edgeId } = await kararCandidate(from, to, 'ret-1', 0.85);
    expect((await decide(editor.token, itemId, { decision: 'ret' })).status).toBe(200);
    const e = await edge(edgeId);
    expect(e).toMatchObject({ confirmed: false, rejected: true });
    expect(e?.confidence).toBeCloseTo(0.85);
    expect((await queueItem(itemId))?.decision).toBe('ret');
  });

  it('doktrin items write work_citations', async () => {
    const from = await record('Doktrin kaynağı');
    const onay = await doktrinCandidate(from, 'yazar-borclar-1');
    const ret = await doktrinCandidate(from, 'yazar-borclar-2');
    expect((await decide(editor.token, onay.itemId, { decision: 'onay' })).status).toBe(200);
    expect((await decide(editor.token, ret.itemId, { decision: 'ret' })).status).toBe(200);
    expect(await workCitation(onay.wcId)).toMatchObject({ confirmed: true, rejected: false });
    expect(await workCitation(ret.wcId)).toMatchObject({ confirmed: false, rejected: true });
  });

  it('a second decision on a closed item is 404 and does not flip the edge', async () => {
    const from = await record('Çift karar kaynağı');
    const to = await record('Çift karar hedefi');
    const { itemId, edgeId } = await kararCandidate(from, to, 'cift-1');
    expect((await decide(editor.token, itemId, { decision: 'onay' })).status).toBe(200);
    expect((await decide(editor.token, itemId, { decision: 'ret' })).status).toBe(404);
    expect(await edge(edgeId)).toMatchObject({ confirmed: true, rejected: false });
  });

  it('duzelt is refused for citations and leaves the item open', async () => {
    const from = await record('Düzelt kaynağı');
    const to = await record('Düzelt hedefi');
    const { itemId } = await kararCandidate(from, to, 'duzelt-1');
    expect((await decide(editor.token, itemId, { decision: 'duzelt' })).status).toBe(400);
    expect((await queueItem(itemId))?.decision).toBeNull();
  });

  it('an item of another queue id or a bad id is not found or rejected', async () => {
    const from = await record('Başka kuyruk kaynağı');
    const to = await record('Başka kuyruk hedefi');
    const { itemId } = await kararCandidate(from, to, 'kuyruk-1');
    const wrongQueue = await adminQueueDecide(
      api(`/v1/admin/queues/cards/${itemId}/decision`, editor.token, {
        method: 'POST',
        body: JSON.stringify({ decision: 'onay' }),
      }),
      params({ queue: 'cards', itemId }),
    );
    expect(wrongQueue.status).toBe(404);
    expect((await decide(editor.token, 'abc', { decision: 'onay' })).status).toBe(400);
    expect((await queueItem(itemId))?.decision).toBeNull();
  });

  it('an item whose subject points at another record does not touch that edge', async () => {
    const a = await record('IDOR kaynağı A');
    const b = await record('IDOR kaynağı B');
    const to = await record('IDOR hedefi');
    const victim = await kararCandidate(b, to, 'idor-b');
    const forged = one(
      await h.db
        .insert(schema.reviewQueueItems)
        .values({
          queue: 'citations',
          subjectType: 'citation_edge',
          subjectId: victim.edgeId,
          payload: { recordId: a, kind: 'karar', confidence: 0.8, reasons: [], context: '', candidate: {} },
        })
        .returning({ id: schema.reviewQueueItems.id }),
    );
    expect((await decide(editor.token, forged.id, { decision: 'ret' })).status).toBe(200);
    expect(await edge(victim.edgeId)).toMatchObject({ confirmed: false, rejected: false });
    const [audit] = await h.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, 'admin.queue.ret'), eq(schema.auditLog.subjectId, forged.id)));
    expect(audit?.diff).toMatchObject({ applied: false });
  });

  it('editor screen read model: parsed payload and the citing record, malformed items left out', async () => {
    const from = await record('Ekran kaynağı');
    const to = await record('Ekran hedefi');
    const { itemId } = await kararCandidate(from, to, 'ekran-1');
    const bad = one(
      await h.db
        .insert(schema.reviewQueueItems)
        .values({ queue: 'citations', subjectType: 'citation_edge', payload: { bozuk: true } })
        .returning({ id: schema.reviewQueueItems.id }),
    );
    const { items } = await listCitationQueue(h.ctx);
    const item = items.find((i) => i.id === itemId);
    expect(item?.payload.kind).toBe('karar');
    expect(item?.source).toMatchObject({ title: 'Ekran kaynağı', esasNo: '2020/1' });
    expect(items.some((i) => i.id === bad.id)).toBe(false);
  });
});
