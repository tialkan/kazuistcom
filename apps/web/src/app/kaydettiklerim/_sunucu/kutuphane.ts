import { toBibtex, toRis, type ExportItem } from '@kazuist/casuist';
import tr from '@kazuist/i18n/tr/kaydettiklerim.json' with { type: 'json' };
import { and, desc, eq, isNotNull, isNull, lt, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { withAuth } from '@/server/auth/guard';
import { apiError, json, noStore, readJson } from '@/server/auth/http';
import { schema, type Db } from '@/server/auth/db';
import { casuistRules } from '@/app/ara/_sunucu/hiz';

/**
 * Kaydettiklerim (plan 10.2/4, SRS FR-23..25) over library_items. Every query is scoped to the caller's user id,
 * so another user's item is indistinguishable from a missing one (IDOR, plan 5.6/2). Records are read through
 * their servable columns only; a record hidden after a takedown drops out of the list and the export.
 */

export const PAGE = 50;

export interface SavedRow extends ExportItem {
  id: string;
  createdAt: string;
  authorityClass: string;
  status: string;
}

const iso = (d: Date | string): string => (d instanceof Date ? d : new Date(d)).toISOString();

/** Cursor: createdAt and id of the last row, base64url. */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString('base64url');
}
export function decodeCursor(c: string): { at: Date; id: string } | null {
  const [at, id] = Buffer.from(c, 'base64url').toString('utf8').split('|');
  const d = at ? new Date(at) : null;
  if (!d || !Number.isFinite(d.getTime()) || !id || !z.uuid().safeParse(id).success) return null;
  return { at: d, id };
}

/** Saved records of a user, newest first, joined with the servable record fields. */
export async function listSaved(
  db: Db,
  userId: string,
  opts: { limit?: number; cursor?: { at: Date; id: string } | null } = {},
): Promise<SavedRow[]> {
  const li = schema.libraryItems;
  const r = schema.records;
  const where: SQL[] = [eq(li.userId, userId), isNotNull(r.maskedText), isNull(r.hiddenAt)];
  if (opts.cursor) {
    const after = or(
      lt(li.createdAt, opts.cursor.at),
      and(eq(li.createdAt, opts.cursor.at), lt(li.id, opts.cursor.id)),
    );
    if (after) where.push(after);
  }
  const rows = await db
    .select({
      id: li.id,
      recordId: li.recordId,
      note: li.note,
      createdAt: li.createdAt,
      type: r.type,
      title: r.title,
      court: r.court,
      chamber: r.chamber,
      esasNo: r.esasNo,
      kararNo: r.kararNo,
      date: r.decisionDate,
      sourceUrl: r.sourceUrl,
      jurisdiction: r.jurisdiction,
      authorityClass: r.authorityClass,
      status: r.status,
    })
    .from(li)
    .innerJoin(r, eq(r.id, li.recordId))
    .where(and(...where))
    .orderBy(desc(li.createdAt), desc(li.id))
    .limit(opts.limit ?? PAGE);
  return rows.map((x) => ({ ...x, createdAt: iso(x.createdAt), date: x.date ?? null }));
}

const AddBody = z.strictObject({ recordId: z.uuid(), note: z.string().max(2000).optional() });

/** GET /v1/library */
export const libraryGet = withAuth({ rate: casuistRules.libraryUser }, async (req, p, ctx) => {
  const raw = new URL(req.url).searchParams.get('cursor');
  const cursor = raw ? decodeCursor(raw) : null;
  if (raw && !cursor) return apiError('bad_request');
  const rows = await listSaved(ctx.db, p.userId, { limit: PAGE + 1, cursor });
  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  return json({
    items: page.map((x) => ({ id: x.id, recordId: x.recordId, note: x.note, createdAt: x.createdAt })),
    nextCursor: rows.length > PAGE && last ? encodeCursor(last.createdAt, last.id) : null,
  });
});

/** POST /v1/library: 201 with the item, 409 when already saved, 400 for an unknown or hidden record. */
export const libraryPost = withAuth({ rate: casuistRules.libraryUser }, async (req, p, ctx) => {
  const body = AddBody.safeParse(await readJson(req));
  if (!body.success) return apiError('bad_request');
  const r = schema.records;
  const [rec] = await ctx.db
    .select({ id: r.id })
    .from(r)
    .where(and(eq(r.id, body.data.recordId), isNotNull(r.maskedText), isNull(r.hiddenAt)))
    .limit(1);
  if (!rec) return apiError('bad_request', tr.hata.kayitYok);
  const [row] = await ctx.db
    .insert(schema.libraryItems)
    .values({ userId: p.userId, recordId: body.data.recordId, note: body.data.note ?? null })
    .onConflictDoNothing()
    .returning();
  if (!row) return apiError('conflict', tr.hata.zatenKayitli);
  return json({ id: row.id, recordId: row.recordId, note: row.note, createdAt: iso(row.createdAt) }, 201);
});

/** DELETE /v1/library/:id: 204, or 404 when the item is not the caller's. */
export const libraryDelete = withAuth({ rate: casuistRules.libraryUser }, async (_req, p, ctx, params) => {
  const id = z.uuid().safeParse(params.id);
  if (!id.success) return apiError('not_found');
  const li = schema.libraryItems;
  const gone = await ctx.db
    .delete(li)
    .where(and(eq(li.id, id.data), eq(li.userId, p.userId)))
    .returning({ id: li.id });
  if (!gone.length) return apiError('not_found');
  return new Response(null, { status: 204, headers: noStore });
});

const ExportQuery = z.strictObject({
  format: z.enum(['isnad-dipnotlu', 'isnad-metinici', 'oscola', 'bluebook', 'ris', 'bibtex']),
});

/**
 * GET /v1/library/export?format=. RIS and BibTeX are produced here (Zotero, EndNote import, FR-24). The İSNAD,
 * OSCOLA and Bluebook formats need a CSL processor that is not in the repository yet; they answer 400 with an
 * explanation instead of an unchecked approximation.
 */
export const libraryExportGet = withAuth({ rate: casuistRules.exportUser }, async (req, p, ctx) => {
  const q = ExportQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return apiError('bad_request');
  if (q.data.format !== 'ris' && q.data.format !== 'bibtex')
    return apiError('bad_request', tr.hata.bicimHazirDegil);
  const rows: SavedRow[] = [];
  let cursor: { at: Date; id: string } | null = null;
  // Whole library, page by page (bounded by the per user rate limit).
  for (let i = 0; i < 40; i++) {
    const page = await listSaved(ctx.db, p.userId, { limit: PAGE, cursor });
    rows.push(...page);
    const last = page[page.length - 1];
    if (page.length < PAGE || !last) break;
    cursor = { at: new Date(last.createdAt), id: last.id };
  }
  const ris = q.data.format === 'ris';
  const body = ris ? toRis(rows) : toBibtex(rows);
  return new Response(body, {
    status: 200,
    headers: {
      ...noStore,
      // The contract declares text/plain; the file name carries the format.
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="kaydettiklerim.${ris ? 'ris' : 'bib'}"`,
    },
  });
});
