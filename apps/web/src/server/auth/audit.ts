import type { Db } from './db.ts';
import { schema } from './db.ts';
import { subjectHash } from './hash.ts';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId?: string | null;
  reason?: string | null;
  /** Field names or ids only; never personal data or secrets. */
  diff?: Record<string, unknown> | null;
}

/** Append only audit log (plan 5.6/9). The trigger in migration 0002 blocks UPDATE and DELETE. */
export async function writeAudit(db: Db, secret: string, e: AuditEntry): Promise<string> {
  const [row] = await db
    .insert(schema.auditLog)
    .values({
      actorId: e.actorId,
      actorHash: e.actorId ? subjectHash(secret, e.actorId) : null,
      action: e.action,
      subjectType: e.subjectType,
      subjectId: e.subjectId ?? null,
      reason: e.reason ?? null,
      diff: e.diff ?? null,
    })
    .returning({ id: schema.auditLog.id });
  if (!row) throw new Error('audit insert failed');
  return row.id;
}
