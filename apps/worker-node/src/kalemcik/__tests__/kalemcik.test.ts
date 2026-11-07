import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { NotifyPayload } from '@kazuist/contracts';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { parse } from 'yaml';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render } from '../../notify/dispatch.ts';
import { channelAllows } from '../../notify/prefs.ts';
import { isQuietHour } from '../../notify/quiet-hours.ts';
import { refIdCoz, refIdOlustur, renderKalemcikNotice } from '../bildirim.ts';
import {
  createKalemcikDailyHandler,
  enqueueKalemcikDailySql,
  gunFarki,
  gunlukCalistir,
  gunlukHedef,
  gunSonrasi,
  istanbulGunu,
  kalemcikTick,
} from '../gunluk.ts';
import { doldur, icerik, ilkHarfBuyuk, varyant } from '../icerik.ts';

const yol = (p: string) => fileURLToPath(new URL(p, import.meta.url));

describe('Kalemcik content (SRS FR-53, FR-54)', () => {
  it('is the generated copy of content/kalemcik.yaml', () => {
    const yaml = parse(readFileSync(yol('../../../../../content/kalemcik.yaml'), 'utf8'));
    expect(JSON.parse(readFileSync(yol('../_veri/kalemcik.json'), 'utf8'))).toEqual(yaml);
  });
  it('has both voices for every message and the four tones of FR-54', () => {
    expect(Object.keys(icerik.tonlar)).toEqual(['iyi', 'son7', 'yazilmadi', 'hedef']);
    expect(icerik.tonlar.iyi.renk).toBe('yesil');
    expect(icerik.tonlar.son7.renk).toBe('turuncu');
    expect(icerik.tonlar.yazilmadi.renk).toBe('pembe');
    expect(icerik.tonlar.yazilmadi.yuz).toBe('uzgun');
    expect(icerik.tonlar.hedef.yuz).toBe('kutlama');
    expect(Object.keys(icerik.teslim)).toEqual(['0', '1', '3', '7', '14']);
  });
  it('never blames or pressures and never uses an emoji or a long dash', () => {
    const hepsi = JSON.stringify(icerik).toLocaleLowerCase('tr-TR');
    for (const yasak of [
      'tembel',
      'neden yazmadın',
      'neden yazmadınız',
      'hâlâ',
      'rezalet',
      'utanç',
      'başarısız',
      'mecbur',
      'yetişmezsen',
      'yetişmezseniz',
      'kaybedersin',
      'kaybedersiniz',
    ])
      expect(hepsi, yasak).not.toContain(yasak);
    expect(hepsi).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(hepsi).not.toContain(String.fromCodePoint(0x2014));
  });
  it('speaks informally in sen and formally in siz', () => {
    expect(icerik.sessizlik.baslik.sen).toBe('Kalemcik seni özledi');
    expect(icerik.sessizlik.baslik.siz).toBe('Kalemcik sizi özledi');
    for (const m of icerik.sessizlik.metin) {
      expect(m.sen).toMatch(/sen|seni|beni|yeter|ayır|için|var/i);
      expect(m.siz).not.toMatch(/\bseni\b|\bsana\b/);
    }
  });
  it('fills placeholders with Turkish number grouping and drops unknown ones', () => {
    expect(doldur('{kalan} kelime, günlük {gunluk}', { kalan: 12000, gunluk: 850 })).toBe(
      '12.000 kelime, günlük 850',
    );
    expect(doldur('{gun} gün {calisma}', { gun: 3 })).toBe('3 gün ');
    expect(ilkHarfBuyuk('çalışmanız için')).toBe('Çalışmanız için');
    expect(ilkHarfBuyuk('iyi')).toBe('İyi');
  });
  it('picks the same variant for the same seed', () => {
    expect(varyant('a', 2)).toBe(varyant('a', 2));
    expect(varyant('x', 1)).toBe(0);
    const secimler = new Set(Array.from({ length: 40 }, (_, i) => varyant(`proje-${i}`, 2)));
    expect(secimler.size).toBe(2);
  });
});

describe('reminder text in notify.send references', () => {
  it('round trips a reference and keeps it short', () => {
    const k = {
      tur: 'teslim7' as const,
      hitap: 'siz' as const,
      varyant: 0,
      kalan: 3200,
      gunluk: 458,
      gun: 7,
      sessiz: 0,
    };
    const ref = refIdOlustur(k);
    expect(ref).toBe('kalemcik:teslim7:siz:0:3200:458:7:0');
    expect(ref.length).toBeLessThanOrEqual(100);
    expect(refIdCoz(ref)).toEqual(k);
  });
  it('refuses references that are not Kalemcik references or are malformed', () => {
    for (const r of [
      '',
      'odeme:x',
      'kalemcik:teslim9:sen:0:1:1:1:0',
      'kalemcik:teslim7:sen:0:1:1:1',
      'kalemcik:teslim7:ben:0:1:1:1:0',
      'kalemcik:teslim7:sen:a:1:1:1:0',
      'kalemcik:teslim7:sen:0:1:1:1:0:9',
    ])
      expect(refIdCoz(r), r).toBeNull();
    expect(renderKalemcikNotice('kalemcik:teslim7:sen:9:1:1:1:0')).toBeNull(); // no such variant
  });
  it('renders the deadline reminder with remaining words and the daily goal in both voices', () => {
    const sen = renderKalemcikNotice('kalemcik:teslim7:sen:0:3200:458:7:0');
    expect(sen).toEqual({
      title: 'Teslime 1 hafta var',
      body: 'Çalışmanız için 7 gün kaldı. Kalan 3.200 kelime, günlük hedef 458.',
      path: '/kalemcik',
    });
    expect(renderKalemcikNotice('kalemcik:teslim0:siz:0:10:10:0:0')?.body).toContain('zaman ayırın');
  });
  it('renders the silence message with the number of silent days', () => {
    const m = renderKalemcikNotice('kalemcik:sessizlik:sen:0:5000:100:50:3');
    expect(m?.title).toBe('Kalemcik seni özledi');
    expect(m?.body).toContain('3 gündür');
    expect(m?.body).toContain('Çalışmanız seni özledi');
    expect(renderKalemcikNotice('kalemcik:sessizlik:siz:0:5000:100:50:4')?.title).toBe(
      'Kalemcik sizi özledi',
    );
  });
});

describe('time helpers', () => {
  it('uses the Istanbul day, not the UTC day', () => {
    expect(istanbulGunu(new Date('2026-11-07T22:30:00Z'))).toBe('2026-11-08');
    expect(istanbulGunu(new Date('2026-11-07T20:59:00Z'))).toBe('2026-11-07');
    expect(gunFarki('2026-11-07', '2026-12-07')).toBe(30);
    expect(gunFarki('2026-12-31', '2027-01-01')).toBe(1);
    expect(gunSonrasi(new Date('2026-11-07T10:00:00Z'), 2).toISOString()).toBe('2026-11-09T05:00:00.000Z');
  });
  it('divides what is left over the days that are left, rounding up', () => {
    expect(gunlukHedef(3200, 7)).toBe(458);
    expect(gunlukHedef(10, 0)).toBe(10);
    expect(gunlukHedef(0, 5)).toBe(0);
  });
});

let pg: PGlite;
let u1: string;
let u2: string;
const saat = (iso: string) => ({ db: pg, now: () => new Date(iso) });

async function proje(
  userId: string,
  o: { target?: number; current?: number; deadline?: string | null; created?: string } = {},
) {
  const r = await pg.query<{ id: string }>(
    `insert into writing_projects (user_id, title, kind, target_words, current_words, deadline, created_at)
     values ($1, 'Gizli Proje Adı', 'makale', $2, $3, $4, $5) returning id`,
    [userId, o.target ?? 6000, o.current ?? 2800, o.deadline ?? null, o.created ?? '2026-10-01T08:00:00Z'],
  );
  return r.rows[0]?.id as string;
}
async function hatirlatma(userId: string, projectId: string, kind: string, nextAt: string | null) {
  const r = await pg.query<{ id: string }>(
    `insert into reminders (user_id, project_id, kind, next_at) values ($1, $2, $3, $4) returning id`,
    [userId, projectId, kind, nextAt],
  );
  return r.rows[0]?.id as string;
}
async function kayit(projectId: string, gun: string, words = 100) {
  await pg.query(`insert into writing_logs (project_id, words, logged_on) values ($1, $2, $3)`, [
    projectId,
    words,
    gun,
  ]);
}
const bildirimler = async () =>
  (
    await pg.query<{ payload: { type: string; userId: string; refId: string }; dedupe_key: string }>(
      `select payload, dedupe_key from jobs where type = 'notify.send' order by created_at, id`,
    )
  ).rows;

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder });
  const k = await pg.query<{ id: string }>(
    `insert into users (email) values ('k1@example.invalid'), ('k2@example.invalid') returning id`,
  );
  u1 = k.rows[0]?.id as string;
  u2 = k.rows[1]?.id as string;
}, 60_000);
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.query(`delete from jobs`);
  await pg.query(`delete from reminders`);
  await pg.query(`delete from writing_projects`);
  await pg.query(`delete from template_rules`);
});

describe('kalemcik.daily: deadline reminders (FR-51)', () => {
  it('sends the 7 day reminder on its day with the remaining words and the daily goal, once', async () => {
    const p = await proje(u1, { target: 6000, current: 2800, deadline: '2026-11-14' });
    await hatirlatma(u1, p, 'teslim_7', '2026-11-07T05:00:00Z');
    const s = await gunlukCalistir(saat('2026-11-07T05:10:00Z'));
    expect(s).toMatchObject({ day: '2026-11-07', teslim: 1, sessizlik: 0 });
    const j = await bildirimler();
    expect(j).toHaveLength(1);
    expect(NotifyPayload.safeParse(j[0]?.payload).success).toBe(true);
    expect(j[0]?.payload).toMatchObject({ type: 'teslim_hatirlatmasi', userId: u1 });
    const ref = j[0]?.payload.refId as string;
    expect(refIdCoz(ref)).toMatchObject({ tur: 'teslim7', hitap: 'sen', kalan: 3200, gunluk: 458, gun: 7 });
    expect(renderKalemcikNotice(ref)?.body).toBe(
      'Çalışmanız için 7 gün kaldı. Kalan 3.200 kelime, günlük hedef 458.',
    );
    // A rerun the same day sends nothing: the reminder was closed before its job was queued.
    const tekrar = await gunlukCalistir(saat('2026-11-07T09:00:00Z'));
    expect(tekrar.teslim).toBe(0);
    expect(await bildirimler()).toHaveLength(1);
  });
  it('sends nothing before the reminder is due', async () => {
    const p = await proje(u1, { deadline: '2026-11-14' });
    await hatirlatma(u1, p, 'teslim_7', '2026-11-07T05:00:00Z');
    expect((await gunlukCalistir(saat('2026-11-07T04:59:00Z'))).teslim).toBe(0);
    expect(await bildirimler()).toHaveLength(0);
  });
  it('does not announce a missed reminder late with wrong numbers', async () => {
    const p = await proje(u1, { deadline: '2026-11-14' });
    const r = await hatirlatma(u1, p, 'teslim_14', '2026-10-31T05:00:00Z');
    const s = await gunlukCalistir(saat('2026-11-07T05:10:00Z')); // 7 days left, but this one is the 14 day reminder
    expect(s).toMatchObject({ teslim: 0, atlanan: 1 });
    expect(await bildirimler()).toHaveLength(0);
    const kalan = await pg.query<{ enabled: boolean }>(`select enabled from reminders where id = $1`, [r]);
    expect(kalan.rows[0]?.enabled).toBe(false);
  });
  it('closes the reminder of a finished project without sending', async () => {
    const p = await proje(u1, { target: 1000, current: 1200, deadline: '2026-11-14' });
    await hatirlatma(u1, p, 'teslim_7', '2026-11-07T05:00:00Z');
    expect(await gunlukCalistir(saat('2026-11-07T05:10:00Z'))).toMatchObject({ teslim: 0, atlanan: 1 });
  });
  it('sends all five reminders of a deadline on their five days', async () => {
    const p = await proje(u1, { target: 7000, current: 0, deadline: '2026-11-28' });
    for (const n of [14, 7, 3, 1, 0]) {
      const at = new Date(Date.UTC(2026, 10, 28 - n, 5, 0, 0)).toISOString();
      await hatirlatma(u1, p, `teslim_${n}`, at);
    }
    for (const n of [14, 7, 3, 1, 0]) {
      const gun = new Date(Date.UTC(2026, 10, 28 - n, 5, 30, 0)).toISOString();
      expect((await gunlukCalistir(saat(gun))).teslim, `day -${n}`).toBe(1);
    }
    const turler = (await bildirimler()).map((j) => refIdCoz(j.payload.refId)?.tur);
    expect(turler).toEqual(['teslim14', 'teslim7', 'teslim3', 'teslim1', 'teslim0']);
  });
  it('uses the form of address the user chose', async () => {
    await pg.query(
      `insert into reminders (user_id, project_id, kind, enabled) values ($1, null, 'hitap_siz', true)`,
      [u2],
    );
    const p1 = await proje(u1, { deadline: '2026-11-14' });
    const p2 = await proje(u2, { deadline: '2026-11-14' });
    await hatirlatma(u1, p1, 'teslim_7', '2026-11-07T05:00:00Z');
    await hatirlatma(u2, p2, 'teslim_7', '2026-11-07T05:00:00Z');
    await gunlukCalistir(saat('2026-11-07T06:00:00Z'));
    const hitaplar = Object.fromEntries(
      (await bildirimler()).map((j) => [j.payload.userId, refIdCoz(j.payload.refId)?.hitap]),
    );
    expect(hitaplar).toEqual({ [u1]: 'sen', [u2]: 'siz' });
  });
});

describe('kalemcik.daily: three days without writing (FR-53)', () => {
  it('stays quiet for two silent days and speaks on the third', async () => {
    const p = await proje(u1, { deadline: '2026-12-31', created: '2026-10-01T08:00:00Z' });
    await hatirlatma(u1, p, 'sessizlik', null);
    await kayit(p, '2026-11-04');
    expect((await gunlukCalistir(saat('2026-11-06T05:30:00Z'))).sessizlik).toBe(0);
    const s = await gunlukCalistir(saat('2026-11-07T05:30:00Z'));
    expect(s.sessizlik).toBe(1);
    const j = await bildirimler();
    expect(j[0]?.payload).toMatchObject({ type: 'kalemcik', userId: u1 });
    expect(refIdCoz(j[0]?.payload.refId as string)).toMatchObject({ tur: 'sessizlik', sessiz: 3 });
  });
  it('repeats at most every second day for the same project', async () => {
    const p = await proje(u1, { deadline: '2026-12-31' });
    await hatirlatma(u1, p, 'sessizlik', null);
    await kayit(p, '2026-11-01');
    const sayilar: number[] = [];
    for (const gun of ['04', '05', '06', '07', '08'])
      sayilar.push((await gunlukCalistir(saat(`2026-11-${gun}T05:30:00Z`))).sessizlik);
    // silent for 3 days on the 4th (send), then every 2 days: the 6th (send), the 5th and 7th are skipped, the 8th sends.
    expect(sayilar).toEqual([1, 0, 1, 0, 1]);
  });
  it('is quiet again when the user writes, and counts a new project from its creation day', async () => {
    const p = await proje(u1, { deadline: '2026-12-31', created: '2026-11-05T08:00:00Z' });
    await hatirlatma(u1, p, 'sessizlik', null);
    expect((await gunlukCalistir(saat('2026-11-07T05:30:00Z'))).sessizlik).toBe(0); // created 2 days ago
    expect((await gunlukCalistir(saat('2026-11-08T05:30:00Z'))).sessizlik).toBe(1);
    await kayit(p, '2026-11-09');
    expect((await gunlukCalistir(saat('2026-11-12T05:30:00Z'))).sessizlik).toBe(1); // silent again after 3 days
    await kayit(p, '2026-11-14');
    expect((await gunlukCalistir(saat('2026-11-15T05:30:00Z'))).sessizlik).toBe(0);
  });
  it('does not nag about a finished project or a deadline that has passed', async () => {
    const bitti = await proje(u1, {
      target: 100,
      current: 100,
      deadline: '2026-12-31',
      created: '2026-10-01T00:00:00Z',
    });
    const gecti = await proje(u1, { deadline: '2026-11-01', created: '2026-10-01T00:00:00Z' });
    await hatirlatma(u1, bitti, 'sessizlik', null);
    await hatirlatma(u1, gecti, 'sessizlik', null);
    expect((await gunlukCalistir(saat('2026-11-07T05:30:00Z'))).sessizlik).toBe(0);
  });
  it('defers to quiet hours through notify.send: the message is queued, delivery waits for 08.00', async () => {
    // The job only queues; notify applies 22.00-08.00 and the user's switches (notify/dispatch.ts).
    expect(isQuietHour(new Date('2026-11-07T20:00:00Z'))).toBe(true); // 23.00 Istanbul
    expect(isQuietHour(new Date('2026-11-07T05:00:00Z'))).toBe(false); // 08.00 Istanbul
    expect(channelAllows({ email: { kalemcik: false }, web_push: {}, apns: {} }, 'email', 'kalemcik')).toBe(
      false,
    );
    expect(channelAllows({ email: {}, web_push: {}, apns: {} }, 'email', 'kalemcik')).toBe(true);
    expect(channelAllows({ email: {}, web_push: {}, apns: {} }, 'email', 'teslim_hatirlatmasi')).toBe(true);
  });
});

describe('kalemcik.daily: what it never does', () => {
  it('keeps titles and text out of the queue, the result and the logs', async () => {
    const p = await proje(u1, { deadline: '2026-11-14' });
    await hatirlatma(u1, p, 'teslim_7', '2026-11-07T05:00:00Z');
    const logs: string[] = [];
    const eski = console.log;
    console.log = (...a: unknown[]) => void logs.push(a.join(' '));
    const s = await gunlukCalistir(saat('2026-11-07T05:10:00Z'));
    console.log = eski;
    const hepsi = JSON.stringify([s, await bildirimler(), logs]);
    expect(hepsi).not.toContain('Gizli Proje Adı');
    expect(hepsi).not.toContain('k1@example.invalid');
  });
  it('is idempotent for two workers running at once', async () => {
    const p = await proje(u1, { deadline: '2026-11-14' });
    await hatirlatma(u1, p, 'teslim_7', '2026-11-07T05:00:00Z');
    const q = await proje(u2, { deadline: '2026-12-31', created: '2026-10-01T00:00:00Z' });
    await hatirlatma(u2, q, 'sessizlik', null);
    await Promise.all([
      gunlukCalistir(saat('2026-11-07T05:10:00Z')),
      gunlukCalistir(saat('2026-11-07T05:10:00Z')),
    ]);
    expect(await bildirimler()).toHaveLength(2);
  });
  it('ignores disabled reminders and reminders of other kinds', async () => {
    const p = await proje(u1, { deadline: '2026-11-14' });
    const id = await hatirlatma(u1, p, 'teslim_7', '2026-11-07T05:00:00Z');
    await pg.query(`update reminders set enabled = false where id = $1`, [id]);
    await hatirlatma(u1, p, 'baska_tur', '2026-11-07T05:00:00Z');
    expect(await gunlukCalistir(saat('2026-11-07T05:10:00Z'))).toMatchObject({ teslim: 0, sessizlik: 0 });
  });
});

describe('kalemcik.daily: retention of extracted rule sets', () => {
  it('deletes unapproved rule sets after 30 days with their quotes, and keeps approved and recent ones', async () => {
    const ekle = async (gun: string, approved: boolean) =>
      (
        await pg.query<{ id: string }>(
          `insert into template_rules (user_id, rules, approved, created_at) values ($1, '{}', $2, $3) returning id`,
          [u1, approved, gun],
        )
      ).rows[0]?.id as string;
    const eski = await ekle('2026-09-01T00:00:00Z', false);
    const yeni = await ekle('2026-10-20T00:00:00Z', false);
    const onayli = await ekle('2026-09-01T00:00:00Z', true);
    await pg.query(
      `insert into template_rule_evidence (template_rule_id, rule_key, excerpt, page) values ($1, 'mTop', 'üst 3 cm', 4)`,
      [eski],
    );
    const s = await gunlukCalistir(saat('2026-11-07T05:10:00Z'));
    expect(s.silinenKurallar).toBe(1);
    const kalan = (await pg.query<{ id: string }>(`select id from template_rules`)).rows
      .map((r) => r.id)
      .sort();
    expect(kalan).toEqual([yeni, onayli].sort());
    expect((await pg.query(`select 1 from template_rule_evidence`)).rows).toHaveLength(0);
  });
});

describe('daily schedule and handler', () => {
  it('queues one kalemcik.daily job per Istanbul day, however often the tick runs', async () => {
    let t = new Date('2026-11-07T05:00:00Z');
    const tick = kalemcikTick(pg, () => t);
    await tick();
    await tick();
    t = new Date('2026-11-07T20:30:00Z'); // 23.30 Istanbul, still the 7th
    await tick();
    expect((await pg.query(`select 1 from jobs where type = 'kalemcik.daily'`)).rows).toHaveLength(1);
    t = new Date('2026-11-07T21:30:00Z'); // 00.30 on the 8th
    await tick();
    expect((await pg.query(`select 1 from jobs where type = 'kalemcik.daily'`)).rows).toHaveLength(2);
    expect(enqueueKalemcikDailySql).toContain('ON CONFLICT DO NOTHING');
  });
  it('runs as a job handler and returns counts only', async () => {
    const p = await proje(u1, { deadline: '2026-11-14' });
    await hatirlatma(u1, p, 'teslim_7', '2026-11-07T05:00:00Z');
    const h = createKalemcikDailyHandler(saat('2026-11-07T05:10:00Z'));
    const sonuc = await h({ id: 'x', type: 'kalemcik.daily', payload: {}, attempts: 1, max_attempts: 5 });
    expect(sonuc).toEqual({ day: '2026-11-07', teslim: 1, sessizlik: 0, atlanan: 0, silinenKurallar: 0 });
  });
});

describe('the notify worker text for Kalemcik references', () => {
  it('currently renders the generic text; the Kalemcik text needs the one-line hook of the request', () => {
    // docs/istekler/yazma-bildirim-metni.md asks kimlik to call renderKalemcikNotice from notify/dispatch.ts render().
    const genel = render('kalemcik', 'kalemcik:sessizlik:sen:0:5000:100:50:3');
    expect(genel.path).toBe('/kalemcik');
    expect(genel.title.length).toBeGreaterThan(0);
  });
});
