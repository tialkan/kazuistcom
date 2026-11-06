import { NotifyPayload } from '@kazuist/contracts';
import type { ClaimedJob } from '@kazuist/db/jobs';
import type { JobHandler, SqlClient } from '../queue.ts';
import { refIdOlustur, type BildirimTuru } from './bildirim.ts';
import { icerik, varyant, type Hitap } from './icerik.ts';

/**
 * kalemcik.daily (plan 10.5/6, SRS FR-51 and FR-53): once a day it looks at every writing project and
 *  - sends the deadline reminders 14, 7, 3, 1 days before and on the day (reminders rows `teslim_<n>`, due at 08:00
 *    Istanbul of that day), each once;
 *  - sends the "3 days without writing" message (reminders row `sessizlik`), at most every 2 days per project;
 *  - removes unapproved rule sets older than 30 days (retention of the writing module).
 * It only enqueues notify.send jobs: quiet hours 22.00-08.00, channels and the user's switches are applied there.
 * A reminder is claimed with a conditional UPDATE before its job is queued, so a rerun or two workers never send
 * it twice (at most once; a crash in between loses one reminder, never repeats it). Nothing here logs or returns
 * a title, text or address; the result holds counts.
 */

export const SESSIZLIK_GUN = 3;
export const TEKRAR_GUN = 2;
export const RETENTION_GUN = 30;
const TZ = 'Europe/Istanbul';

export const istanbulGunu = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export function gunFarki(a: string, b: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Next 08:00 Istanbul that is `gun` days after `d`'s Istanbul day. */
export function gunSonrasi(d: Date, gun: number): Date {
  const [y, m, g] = istanbulGunu(d).split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, g + gun, 5, 0, 0));
}

export interface GunlukBagimliliklar {
  db: SqlClient;
  now?: () => Date;
}

export interface GunlukSonuc {
  day: string;
  teslim: number;
  sessizlik: number;
  atlanan: number;
  silinenKurallar: number;
}

interface TeslimSatiri {
  id: string;
  kind: string;
  project_id: string;
  user_id: string;
  target_words: number;
  current_words: number;
  deadline: string | null;
}
interface SessizlikSatiri {
  id: string;
  project_id: string;
  user_id: string;
  target_words: number;
  current_words: number;
  deadline: string | null;
  created_day: string;
  last_logged: string | null;
}

const TESLIM_SQL = `
SELECT r.id, r.kind, p.id AS project_id, p.user_id, p.target_words, p.current_words, p.deadline::text AS deadline
FROM reminders r JOIN writing_projects p ON p.id = r.project_id
WHERE r.enabled AND r.kind LIKE 'teslim\\_%' AND r.next_at <= $1
ORDER BY r.next_at`;

const SESSIZLIK_SQL = `
SELECT r.id, p.id AS project_id, p.user_id, p.target_words, p.current_words, p.deadline::text AS deadline,
       (p.created_at AT TIME ZONE 'Europe/Istanbul')::date::text AS created_day,
       (SELECT max(l.logged_on)::text FROM writing_logs l WHERE l.project_id = p.id) AS last_logged
FROM reminders r JOIN writing_projects p ON p.id = r.project_id
WHERE r.enabled AND r.kind = 'sessizlik' AND (r.next_at IS NULL OR r.next_at <= $1)`;

const HITAP_SQL = `SELECT user_id FROM reminders WHERE kind = 'hitap_siz' AND enabled AND project_id IS NULL`;

/** Close the reminder before queueing its job; true only for the caller that closed it. */
const KAPAT_TESLIM_SQL = `UPDATE reminders SET enabled = false WHERE id = $1 AND enabled RETURNING id`;
const SIRADAKI_SESSIZLIK_SQL = `UPDATE reminders SET next_at = $2 WHERE id = $1 AND (next_at IS NULL OR next_at <= $3) RETURNING id`;
const KUYRUK_SQL = `INSERT INTO jobs (type, payload, dedupe_key) VALUES ('notify.send', $1::jsonb, $2) ON CONFLICT DO NOTHING`;
const KURAL_TEMIZLIK_SQL = `DELETE FROM template_rules WHERE approved = false AND created_at < $1 RETURNING id`;

function kalanKelime(s: { target_words: number; current_words: number }) {
  return Math.max(0, s.target_words - s.current_words);
}

export function gunlukHedef(kalan: number, kalanGun: number): number {
  return kalan === 0 ? 0 : Math.ceil(kalan / Math.max(1, kalanGun));
}

export async function gunlukCalistir(deps: GunlukBagimliliklar, _payload?: unknown): Promise<GunlukSonuc> {
  const simdi = deps.now?.() ?? new Date();
  const bugun = istanbulGunu(simdi);
  const sonuc: GunlukSonuc = { day: bugun, teslim: 0, sessizlik: 0, atlanan: 0, silinenKurallar: 0 };
  const { rows: sizler } = await deps.db.query<{ user_id: string }>(HITAP_SQL);
  const siz = new Set(sizler.map((r) => r.user_id));
  const hitapOf = (userId: string): Hitap => (siz.has(userId) ? 'siz' : 'sen');

  const kuyrukla = async (
    tip: 'teslim_hatirlatmasi' | 'kalemcik',
    userId: string,
    refId: string,
    anahtar: string,
  ) => {
    const yuk = NotifyPayload.parse({ type: tip, userId, refId });
    await deps.db.query(KUYRUK_SQL, [JSON.stringify(yuk), anahtar]);
  };

  // 1) Deadline reminders.
  const { rows: teslimler } = await deps.db.query<TeslimSatiri>(TESLIM_SQL, [simdi.toISOString()]);
  for (const r of teslimler) {
    const n = Number(r.kind.slice('teslim_'.length));
    const kalanGun = r.deadline ? gunFarki(bugun, r.deadline) : null;
    const tamam = r.target_words > 0 && r.current_words >= r.target_words;
    const { rows: kapandi } = await deps.db.query(KAPAT_TESLIM_SQL, [r.id]);
    if (!kapandi.length) continue;
    // Send only on the day the reminder is about; a missed day is not announced late with wrong numbers.
    if (kalanGun !== n || tamam || ![14, 7, 3, 1, 0].includes(n)) {
      sonuc.atlanan += 1;
      continue;
    }
    const kalan = kalanKelime(r);
    const metinler = icerik.teslim[String(n) as '14' | '7' | '3' | '1' | '0'].metin;
    const tur = `teslim${n}` as BildirimTuru;
    await kuyrukla(
      'teslim_hatirlatmasi',
      r.user_id,
      refIdOlustur({
        tur,
        hitap: hitapOf(r.user_id),
        varyant: varyant(`${r.project_id}:${bugun}`, metinler.length),
        kalan,
        gunluk: gunlukHedef(kalan, n),
        gun: n,
        sessiz: 0,
      }),
      `kalemcik:${r.id}:${bugun}`,
    );
    sonuc.teslim += 1;
  }

  // 2) Three days without a record, at most every second day per project.
  const { rows: sessizler } = await deps.db.query<SessizlikSatiri>(SESSIZLIK_SQL, [simdi.toISOString()]);
  for (const r of sessizler) {
    const sonGun = r.last_logged ?? r.created_day;
    const sessiz = gunFarki(sonGun, bugun);
    const tamam = r.target_words > 0 && r.current_words >= r.target_words;
    const gecmis = r.deadline !== null && gunFarki(bugun, r.deadline) < 0;
    if (sessiz < SESSIZLIK_GUN || tamam || gecmis) continue;
    const { rows: alindi } = await deps.db.query(SIRADAKI_SESSIZLIK_SQL, [
      r.id,
      gunSonrasi(simdi, TEKRAR_GUN).toISOString(),
      simdi.toISOString(),
    ]);
    if (!alindi.length) continue;
    const kalan = kalanKelime(r);
    const kalanGun = r.deadline ? Math.max(0, gunFarki(bugun, r.deadline)) : 0;
    await kuyrukla(
      'kalemcik',
      r.user_id,
      refIdOlustur({
        tur: 'sessizlik',
        hitap: hitapOf(r.user_id),
        varyant: varyant(`${r.project_id}:${bugun}`, icerik.sessizlik.metin.length),
        kalan,
        gunluk: r.deadline ? gunlukHedef(kalan, kalanGun) : 0,
        gun: kalanGun,
        sessiz,
      }),
      `kalemcik:${r.id}:${bugun}`,
    );
    sonuc.sessizlik += 1;
  }

  // 3) Retention: rule sets extracted from an uploaded guide stay 30 days unless an editor approved them.
  const sinir = new Date(simdi.getTime() - RETENTION_GUN * 86_400_000);
  const { rows: silinen } = await deps.db.query(KURAL_TEMIZLIK_SQL, [sinir.toISOString()]);
  sonuc.silinenKurallar = silinen.length;
  return sonuc;
}

/** JobHandler for the consumer: `{ 'kalemcik.daily': createKalemcikDailyHandler(deps) }`. */
export function createKalemcikDailyHandler(deps: GunlukBagimliliklar): JobHandler {
  return (job: ClaimedJob) => gunlukCalistir(deps, job.payload);
}

/** One kalemcik.daily job per Istanbul day (the partial unique index drops a repeat while one is queued or running). */
export const enqueueKalemcikDailySql = `
INSERT INTO jobs (type, payload, dedupe_key)
VALUES ('kalemcik.daily', '{}'::jsonb, 'kalemcik.daily:' || $1)
ON CONFLICT DO NOTHING`;

/** Tick for the runner (same shape as dailyBillingTick): enqueues at most once per Istanbul day per process. */
export function kalemcikTick(db: SqlClient, now: () => Date = () => new Date()): () => Promise<void> {
  let son = '';
  return async () => {
    const bugun = istanbulGunu(now());
    if (bugun === son) return;
    await db.query(enqueueKalemcikDailySql, [bugun]);
    son = bugun;
  };
}
