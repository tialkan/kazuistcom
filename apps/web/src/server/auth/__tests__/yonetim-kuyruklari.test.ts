import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '../db.ts';
import { adminQueueDecide, adminQueueGet, takedownPost } from '../handlers.ts';
import {
  ANON_SPANS_SHOWN,
  hideDeadline,
  listAnonymizationQueue,
  listTakedownQueue,
  overdueHideCount,
} from '../review-queues.ts';
import { api, createHarness, params, signUp, staffUser, type Harness } from './harness.ts';

/** Read models of /hesap/yonetim/kaldirma and /hesap/yonetim/anonimlestirme; decisions use the admin API. */

let h: Harness;
let editor: { token: string; id: string };
const body = async (r: Response) => JSON.parse(await r.text());
const HOUR = 3_600_000;
let n = 0;

beforeAll(async () => {
  h = await createHarness();
  editor = await staffUser(h, 'kuyruk-editor@example.invalid');
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

async function record(text = 'metin'): Promise<string> {
  n += 1;
  return (
    await h.pg.query<{ id: string }>(
      `insert into records (type, title, court, esas_no, authority_class, license_basis, source_url, source_key, fetched_at, text)
       values ('karar', 'Örnek karar', 'Yargıtay', '2024/1', 'emsal', 'FSEK m.31', 'https://example.invalid/k', $1, now(), $2)
       returning id`,
      [`test:kuyruk:${n}`, text],
    )
  ).rows[0]?.id as string;
}

async function takedown(rec: string, kind = 'kisisel_veri'): Promise<string> {
  const res = await takedownPost(
    api('/v1/takedown-requests', null, {
      method: 'POST',
      body: JSON.stringify({
        kind,
        targetType: 'record',
        targetId: rec,
        reason: '<b>Adım</b> geçiyor',
        contactEmail: 'talep-sahibi@example.invalid',
      }),
    }),
  );
  expect(res.status).toBe(201);
  return (await body(res)).id as string;
}

const decide = (token: string | null, queue: string, itemId: string, decision: string) =>
  adminQueueDecide(
    api(`/v1/admin/queues/${queue}/${itemId}/decision`, token, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),
    params({ queue, itemId }),
  );

describe('72 hour hiding deadline', () => {
  const t0 = new Date('2026-11-10T09:00:00Z');
  const due = new Date(t0.getTime() + 72 * HOUR);
  it.each([
    [0, 72, 'ok'],
    [60 * HOUR + 1, 11, 'soon'],
    [72 * HOUR, 0, 'overdue'],
    [77 * HOUR + 1, -6, 'overdue'],
  ])('%i ms after intake: %i hours, %s', (after, hours, state) => {
    expect(hideDeadline(due, new Date(t0.getTime() + after))).toMatchObject({ hoursLeft: hours, state });
  });
});

describe('takedowns are records only (Kampus out of scope, ADR-0031)', () => {
  it.each(['kampus_post', 'kampus_file'])('%s targets are refused as unknown', async (targetType) => {
    const res = await takedownPost(
      api('/v1/takedown-requests', null, {
        method: 'POST',
        body: JSON.stringify({
          kind: 'telif',
          targetType,
          targetId: '00000000-0000-4000-8000-000000000001',
          reason: 'x',
          contactEmail: 'k@example.invalid',
        }),
      }),
    );
    expect(res.status).toBe(400);
    const rows = await h.db
      .select()
      .from(schema.takedownRequests)
      .where(eq(schema.takedownRequests.targetType, targetType as 'kampus_post'));
    expect(rows).toHaveLength(0);
  });
});

describe('takedowns screen', () => {
  it('lists overdue hiding decisions first, release steps, deadlines and no requester contact', async () => {
    const real = h.clock.now;
    const fresh = await record();
    const old = await record();
    const remask = await record();
    h.clock.now = new Date(real.getTime() - 80 * HOUR);
    const overdueId = await takedown(old, 'telif');
    h.clock.now = real;
    const freshId = await takedown(fresh);
    const remaskId = await takedown(remask);

    const before = await listTakedownQueue(h.ctx);
    const remaskItem = before.items.find((i) => i.takedownId === remaskId);
    expect(remaskItem).toBeTruthy();
    expect((await decide(editor.token, 'takedowns', remaskItem?.id ?? '', 'duzelt')).status).toBe(200);

    const { items } = await listTakedownQueue(h.ctx);
    expect(items[0]?.takedownId).toBe(overdueId);
    expect(items[0]?.hide).toMatchObject({ state: 'overdue', hoursLeft: -8 });
    expect(items[0]?.answerDueAt).toBeNull();
    const f = items.find((i) => i.takedownId === freshId);
    expect(f).toMatchObject({ step: 'decision', status: 'bekliyor', kind: 'kisisel_veri' });
    expect(f?.hide?.state).toBe('ok');
    expect(f?.answerDueAt).not.toBeNull();
    expect(f?.record).toMatchObject({ title: 'Örnek karar', court: 'Yargıtay', esasNo: '2024/1' });
    expect(f?.reason).toBe('<b>Adım</b> geçiyor');
    const r = items.filter((i) => i.takedownId === remaskId);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      step: 'release',
      status: 'sonuclandi',
      decision: 'ek_maskeleme',
      hide: null,
    });
    expect(JSON.stringify(items)).not.toContain('talep-sahibi@example.invalid');
    expect(await overdueHideCount(h.ctx)).toBe(1);

    // Temporary hiding answers the deadline: the request leaves the overdue count and loses its countdown.
    expect((await decide(editor.token, 'takedowns', items[0]?.id ?? '', 'onay')).status).toBe(200);
    expect(await overdueHideCount(h.ctx)).toBe(0);
    const after = await listTakedownQueue(h.ctx);
    expect(after.items.find((i) => i.takedownId === overdueId)).toMatchObject({
      status: 'gecici_gizlendi',
      hide: null,
    });
  });
});

describe('anonymization screen', () => {
  async function anonItem(rec: string | null, payload: unknown, priority = 10): Promise<string> {
    const [row] = await h.db
      .insert(schema.reviewQueueItems)
      .values({ queue: 'anonymization', subjectType: 'record', subjectId: rec, payload, priority })
      .returning({ id: schema.reviewQueueItems.id });
    return row?.id as string;
  }

  it('shows each span with code point accurate context; malformed payloads are left out', async () => {
    // An astral character before the name: Python offsets count it as one, UTF-16 as two.
    const text = `Davacı 𝔸 Ayşe Yılmaz İstanbul'da oturur.`;
    const start = Array.from(text).indexOf('A');
    const rec = await record(text);
    const id = await anonItem(rec, {
      policyVersion: 'p1',
      anonymizationVersion: 'v1',
      childStrict: true,
      items: [
        {
          charStart: start,
          charEnd: start + 11,
          entity: 'PERSON',
          mask: 'A.Y.',
          detector: 'ner',
          score: 0.71,
        },
      ],
    });
    const bad = await anonItem(rec, { items: 'bozuk' });
    const blocked = await anonItem(
      rec,
      { anonymizationVersion: 'v1', blocked: 'NER_UNAVAILABLE', items: [] },
      50,
    );
    const { items } = await listAnonymizationQueue(h.ctx);
    expect(items.map((i) => i.id)).not.toContain(bad);
    expect(items[0]?.id).toBe(blocked);
    expect(items[0]?.blocked).toBe('NER_UNAVAILABLE');
    const it0 = items.find((i) => i.id === id);
    expect(it0).toMatchObject({ anonymizationVersion: 'v1', childStrict: true, more: 0 });
    expect(it0?.record?.title).toBe('Örnek karar');
    expect(it0?.spans[0]).toEqual({
      entity: 'PERSON',
      mask: 'A.Y.',
      detector: 'ner',
      score: 0.71,
      before: 'Davacı 𝔸 ',
      span: 'Ayşe Yılmaz',
      after: " İstanbul'da oturur.",
    });
  });

  it('shows the first spans and counts the rest', async () => {
    const rec = await record('x'.repeat(500));
    const many = Array.from({ length: ANON_SPANS_SHOWN + 3 }, (_, i) => ({
      charStart: i * 10,
      charEnd: i * 10 + 3,
      entity: 'PERSON',
      mask: 'X.',
    }));
    const id = await anonItem(rec, { anonymizationVersion: 'v1', items: many });
    const it0 = (await listAnonymizationQueue(h.ctx)).items.find((i) => i.id === id);
    expect(it0?.spans).toHaveLength(ANON_SPANS_SHOWN);
    expect(it0?.more).toBe(3);
  });

  it('a decision through the admin API closes the item; only staff with the second step may decide', async () => {
    const rec = await record('Davalı Mehmet Demir.');
    const id = await anonItem(rec, {
      anonymizationVersion: 'v1',
      items: [{ charStart: 7, charEnd: 19, entity: 'PERSON', mask: 'M.D.' }],
    });
    const user = await signUp('anon-kullanici@example.invalid');
    const noStep = await staffUser(h, 'anon-adimsiz@example.invalid', 'editor', false);
    expect((await decide(null, 'anonymization', id, 'onay')).status).toBe(401);
    expect((await decide(user.token, 'anonymization', id, 'onay')).status).toBe(403);
    expect((await decide(noStep.token, 'anonymization', id, 'onay')).status).toBe(403);
    const list = await adminQueueGet(
      api('/v1/admin/queues/anonymization', user.token),
      params({ queue: 'anonymization' }),
    );
    expect(list.status).toBe(403);

    expect((await decide(editor.token, 'anonymization', id, 'onay')).status).toBe(200);
    const [row] = await h.db.select().from(schema.reviewQueueItems).where(eq(schema.reviewQueueItems.id, id));
    expect(row).toMatchObject({ decision: 'onay', decidedBy: editor.id });
    expect((await listAnonymizationQueue(h.ctx)).items.map((i) => i.id)).not.toContain(id);
    expect((await decide(editor.token, 'anonymization', id, 'ret')).status).toBe(404);
  });
});
