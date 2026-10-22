/**
 * Billing notices to notify.send (audit Y5). Due rows of the notices table (send_at reached, sent_at null)
 * become notify.send jobs in one statement: the row is locked with SKIP LOCKED, the job is inserted with
 * dedupe key notice:<id>, and the row gets sent_at and job_id, so concurrent ticks never send twice.
 *
 * Type mapping (contracts notificationTypes): fesih_teyidi stays fesih_teyidi; every other billing notice
 * (odeme_7_gun, yillik_30_gun, odeme_alindi, odeme_basarisiz, plan_ucretsize_indi, fiyat_degisikligi,
 * sozlesme) is 'odeme'. refId is "<kind>:<ref>" so the renderer can tell them apart (istek:
 * docs/istekler/odeme-bildirim-turleri.md asks for finer types).
 */
import type { SqlClient } from '../queue.ts';

export const dispatchDueNoticesSql = `
WITH due AS (
  SELECT id, user_id, kind, ref FROM notices
  WHERE sent_at IS NULL AND send_at <= $1
  ORDER BY send_at
  LIMIT $2
  FOR UPDATE SKIP LOCKED
),
queued AS (
  INSERT INTO jobs (type, payload, dedupe_key)
  SELECT 'notify.send'::job_type,
         jsonb_build_object(
           'type', CASE WHEN due.kind = 'fesih_teyidi' THEN 'fesih_teyidi' ELSE 'odeme' END,
           'userId', due.user_id,
           'refId', left(due.kind || ':' || due.ref, 100)),
         'notice:' || due.id
  FROM due
  ON CONFLICT DO NOTHING
  RETURNING id, dedupe_key
)
UPDATE notices n SET sent_at = $1, job_id = queued.id
FROM queued WHERE queued.dedupe_key = 'notice:' || n.id
RETURNING n.id`;

/** Runner tick: dispatch due notices in batches; returns how many were queued. */
export function noticeTick(
  db: SqlClient,
  now: () => Date = () => new Date(),
  batch = 200,
): () => Promise<number> {
  return async () => {
    let total = 0;
    for (;;) {
      const { rows } = await db.query(dispatchDueNoticesSql, [now(), batch]);
      total += rows.length;
      if (rows.length < batch) return total;
    }
  };
}
