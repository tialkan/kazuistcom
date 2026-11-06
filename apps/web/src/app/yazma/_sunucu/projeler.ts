import { and, desc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type Db } from '@/server/auth/db.ts';

/**
 * Writing projects, daily progress and the reminder rows that Kalemcik's daily job reads (plan 10.5/6, SRS
 * FR-45..56). Every query is scoped to the signed in user; another user's id answers like a missing one.
 */

export const projeTurleri = ['tez', 'makale', 'odev'] as const;

export const ProjeGirdisi = z.strictObject({
  title: z.string().trim().min(1).max(300),
  kind: z.enum(projeTurleri),
  targetWords: z.number().int().min(0).max(2_000_000),
  deadline: z.iso.date().optional(),
});
export const ProjeGuncelleme = ProjeGirdisi.partial();
export const IlerlemeGirdisi = z.strictObject({
  words: z.number().int().min(0).max(100_000),
  note: z.string().trim().max(1000).optional(),
});
export const HitapGirdisi = z.strictObject({ hitap: z.enum(['sen', 'siz']) });

/** Reminder offsets in days before the deadline (FR-51). */
export const TESLIM_GUNLERI = [14, 7, 3, 1, 0] as const;
export const SESSIZLIK = 'sessizlik';
export const HITAP_SIZ = 'hitap_siz';
const teslimTuru = (gun: number) => `teslim_${gun}`;

const TZ = 'Europe/Istanbul';

/** YYYY-MM-DD of `d` in Istanbul. */
export function istanbulGunu(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** 08:00 Istanbul (05:00 UTC) of the day `gun` days before `teslim` (YYYY-MM-DD). */
export function hatirlatmaZamani(teslim: string, gun: number): Date {
  const [y, m, d] = teslim.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - gun, 5, 0, 0));
}

export interface Proje {
  id: string;
  title: string;
  kind: string;
  targetWords: number;
  deadline: string | null;
  currentWords: number;
}

export interface GunKaydi {
  loggedOn: string;
  words: number;
}

const satir = (r: typeof schema.writingProjects.$inferSelect): Proje => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  targetWords: r.targetWords,
  deadline: r.deadline,
  currentWords: r.currentWords,
});

export async function projeleriListele(db: Db, userId: string): Promise<Proje[]> {
  const rows = await db
    .select()
    .from(schema.writingProjects)
    .where(eq(schema.writingProjects.userId, userId))
    .orderBy(desc(schema.writingProjects.createdAt));
  return rows.map(satir);
}

export async function projeyiGetir(
  db: Db,
  userId: string,
  id: string,
  simdi: Date,
): Promise<(Proje & { recentLogs: GunKaydi[] }) | null> {
  const [r] = await db
    .select()
    .from(schema.writingProjects)
    .where(and(eq(schema.writingProjects.id, id), eq(schema.writingProjects.userId, userId)));
  if (!r) return null;
  const baslangic = istanbulGunu(new Date(simdi.getTime() - 13 * 86_400_000));
  const kayitlar = await db
    .select({ loggedOn: schema.writingLogs.loggedOn, words: schema.writingLogs.words })
    .from(schema.writingLogs)
    .where(and(eq(schema.writingLogs.projectId, id), gte(schema.writingLogs.loggedOn, baslangic)))
    .orderBy(schema.writingLogs.loggedOn);
  const gunluk = new Map<string, number>();
  for (const k of kayitlar) gunluk.set(k.loggedOn, (gunluk.get(k.loggedOn) ?? 0) + k.words);
  return { ...satir(r), recentLogs: [...gunluk].map(([loggedOn, words]) => ({ loggedOn, words })) };
}

/** Replace the deadline reminders of a project; reminders that are already in the past are not created. */
async function hatirlatmalariKur(db: Db, userId: string, projectId: string, deadline: string | null, simdi: Date) {
  const oncekiler = await db
    .select({ id: schema.reminders.id, kind: schema.reminders.kind })
    .from(schema.reminders)
    .where(eq(schema.reminders.projectId, projectId));
  for (const o of oncekiler) if (o.kind.startsWith('teslim_')) await db.delete(schema.reminders).where(eq(schema.reminders.id, o.id));
  if (deadline) {
    for (const gun of TESLIM_GUNLERI) {
      const at = hatirlatmaZamani(deadline, gun);
      if (at.getTime() <= simdi.getTime()) continue;
      await db.insert(schema.reminders).values({ userId, projectId, kind: teslimTuru(gun), nextAt: at, enabled: true });
    }
  }
  if (!oncekiler.some((o) => o.kind === SESSIZLIK))
    await db.insert(schema.reminders).values({ userId, projectId, kind: SESSIZLIK, nextAt: null, enabled: true });
}

export async function projeOlustur(db: Db, userId: string, g: z.infer<typeof ProjeGirdisi>, simdi: Date): Promise<Proje> {
  const [r] = await db
    .insert(schema.writingProjects)
    .values({ userId, title: g.title, kind: g.kind, targetWords: g.targetWords, deadline: g.deadline ?? null })
    .returning();
  if (!r) throw new Error('insert failed');
  await hatirlatmalariKur(db, userId, r.id, r.deadline, simdi);
  return satir(r);
}

export async function projeGuncelle(
  db: Db,
  userId: string,
  id: string,
  g: z.infer<typeof ProjeGuncelleme>,
  simdi: Date,
): Promise<Proje | null> {
  const set: Partial<typeof schema.writingProjects.$inferInsert> = {};
  if (g.title !== undefined) set.title = g.title;
  if (g.kind !== undefined) set.kind = g.kind;
  if (g.targetWords !== undefined) set.targetWords = g.targetWords;
  if (g.deadline !== undefined) set.deadline = g.deadline;
  const [r] = Object.keys(set).length
    ? await db
        .update(schema.writingProjects)
        .set(set)
        .where(and(eq(schema.writingProjects.id, id), eq(schema.writingProjects.userId, userId)))
        .returning()
    : await db
        .select()
        .from(schema.writingProjects)
        .where(and(eq(schema.writingProjects.id, id), eq(schema.writingProjects.userId, userId)));
  if (!r) return null;
  if (g.deadline !== undefined) await hatirlatmalariKur(db, userId, r.id, r.deadline, simdi);
  return satir(r);
}

export async function projeyiSil(db: Db, userId: string, id: string): Promise<boolean> {
  const silinen = await db
    .delete(schema.writingProjects)
    .where(and(eq(schema.writingProjects.id, id), eq(schema.writingProjects.userId, userId)))
    .returning({ id: schema.writingProjects.id });
  return silinen.length > 0;
}

/** Add today's words (Istanbul day). Returns false when the project is not the user's. */
export async function ilerlemeKaydet(
  db: Db,
  userId: string,
  id: string,
  g: z.infer<typeof IlerlemeGirdisi>,
  simdi: Date,
  kaynak: 'manuel' | 'docx' = 'manuel',
): Promise<boolean> {
  const [r] = await db
    .select({ id: schema.writingProjects.id, current: schema.writingProjects.currentWords })
    .from(schema.writingProjects)
    .where(and(eq(schema.writingProjects.id, id), eq(schema.writingProjects.userId, userId)));
  if (!r) return false;
  await db.insert(schema.writingLogs).values({
    projectId: id,
    words: g.words,
    source: kaynak,
    note: g.note ?? null,
    loggedOn: istanbulGunu(simdi),
  });
  await db
    .update(schema.writingProjects)
    .set({ currentWords: r.current + g.words })
    .where(eq(schema.writingProjects.id, id));
  return true;
}

/** Kalemcik's form of address: sen unless the user chose siz (a user level reminder row, see the request). */
export async function hitapOku(db: Db, userId: string): Promise<'sen' | 'siz'> {
  const [r] = await db
    .select({ enabled: schema.reminders.enabled })
    .from(schema.reminders)
    .where(and(eq(schema.reminders.userId, userId), eq(schema.reminders.kind, HITAP_SIZ)));
  return r?.enabled ? 'siz' : 'sen';
}

export async function hitapYaz(db: Db, userId: string, hitap: 'sen' | 'siz'): Promise<void> {
  const [r] = await db
    .select({ id: schema.reminders.id })
    .from(schema.reminders)
    .where(and(eq(schema.reminders.userId, userId), eq(schema.reminders.kind, HITAP_SIZ)));
  if (r) await db.update(schema.reminders).set({ enabled: hitap === 'siz' }).where(eq(schema.reminders.id, r.id));
  else await db.insert(schema.reminders).values({ userId, projectId: null, kind: HITAP_SIZ, enabled: hitap === 'siz' });
}
