import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type Db } from '@/server/auth/db.ts';
import { asciiSlug } from '../_cekirdek/dosya-adi.ts';
import {
  eksikleriDoldur,
  kaynaklar as kaynakDegerleri,
  kuralAnahtarlari,
  type Kanit,
  type KuralAnahtari,
  type KuralKaydi,
} from '../_cekirdek/kural-semasi.ts';

/**
 * Journal profiles (plan 10.5/5, FR-39..42). Rules read from a journal page become a draft: a journal rule
 * version without approval plus an item in the editor queue `journal-rules`. Only a version an editor approved
 * ("onay" decision, or approved_at) is ever shown to users. Nothing here is guessed: values come from the
 * journal's own writing rules through the same verbatim check as guide extraction.
 */

export const DERGI_KUYRUGU = 'journal-rules' as const;
const ALT_SINIR = 50;

export interface DergiOzeti {
  id: string;
  name: string;
  issn: string | null;
  slug: string;
  hasApprovedRules: boolean;
}

export interface OnayliKural {
  id: string;
  version: number;
  approvedAt: string | null;
  sourceUrl: string | null;
  kayit: KuralKaydi;
}

/** Stored shape of journal_rule_versions.rules and of the queue payload. */
export const KuralPaketi = z.object({
  tur: z.enum(['tez', 'makale']),
  degerler: z.record(z.string(), z.unknown()),
  kaynaklar: z.record(z.string(), z.enum(kaynakDegerleri)),
  kanitlar: z.record(z.string(), z.object({ sayfa: z.number().int().nullable(), alinti: z.string() })),
});

export function paketeCevir(k: KuralKaydi) {
  return { tur: k.tur, degerler: k.degerler as unknown as Record<string, unknown>, kaynaklar: k.kaynaklar, kanitlar: k.kanitlar };
}

export function paketiCoz(raw: unknown): KuralKaydi | null {
  const p = KuralPaketi.safeParse(raw);
  if (!p.success) return null;
  const kayit = eksikleriDoldur(p.data.degerler, p.data.tur);
  for (const k of kuralAnahtarlari) {
    const kaynak = p.data.kaynaklar[k];
    const kanit = p.data.kanitlar[k];
    // A field counts as "Kılavuzdan" only with evidence and only when its value passed validation.
    const gecerli = JSON.stringify(kayit.degerler[k]) === JSON.stringify(p.data.degerler[k]);
    if (kaynak === 'kilavuz' && kanit && gecerli) {
      kayit.kaynaklar[k] = 'kilavuz';
      kayit.kanitlar[k as KuralAnahtari] = kanit as Kanit;
    }
  }
  return kayit;
}

async function onayliSurumler(db: Db, versiyonlar: { id: string; approvedAt: Date | null }[]) {
  const kararlar = versiyonlar.length
    ? await db
        .select({ subjectId: schema.reviewQueueItems.subjectId, decidedAt: schema.reviewQueueItems.decidedAt })
        .from(schema.reviewQueueItems)
        .where(
          and(
            eq(schema.reviewQueueItems.queue, DERGI_KUYRUGU),
            eq(schema.reviewQueueItems.decision, 'onay'),
            inArray(
              schema.reviewQueueItems.subjectId,
              versiyonlar.map((v) => v.id),
            ),
          ),
        )
    : [];
  const harita = new Map(kararlar.map((k) => [k.subjectId, k.decidedAt]));
  return new Map(
    versiyonlar.flatMap((v) => {
      const at = v.approvedAt ?? harita.get(v.id) ?? null;
      return v.approvedAt || harita.has(v.id) ? [[v.id, at] as const] : [];
    }),
  );
}

export async function dergiAra(db: Db, q: string | undefined): Promise<DergiOzeti[]> {
  const aranan = q?.trim();
  const desen = aranan ? `%${aranan.replace(/[\\%_]/g, '\\$&')}%` : null;
  const satirlar = await db
    .select()
    .from(schema.journals)
    .where(
      desen
        ? or(ilike(schema.journals.name, desen), ilike(schema.journals.issn, desen), ilike(schema.journals.eissn, desen))
        : undefined,
    )
    .orderBy(asc(schema.journals.name))
    .limit(ALT_SINIR);
  if (!satirlar.length) return [];
  const surumler = await db
    .select({ id: schema.journalRuleVersions.id, journalId: schema.journalRuleVersions.journalId, approvedAt: schema.journalRuleVersions.approvedAt })
    .from(schema.journalRuleVersions)
    .where(
      inArray(
        schema.journalRuleVersions.journalId,
        satirlar.map((s) => s.id),
      ),
    );
  const onayli = await onayliSurumler(db, surumler);
  const var_ = new Set(surumler.filter((s) => onayli.has(s.id)).map((s) => s.journalId));
  return satirlar.map((s) => ({
    id: s.id,
    name: s.name,
    issn: s.issn,
    slug: asciiSlug(s.name),
    hasApprovedRules: var_.has(s.id),
  }));
}

export async function dergiyiBul(db: Db, kimlik: { id?: string; slug?: string }) {
  if (kimlik.id) {
    const [d] = await db.select().from(schema.journals).where(eq(schema.journals.id, kimlik.id));
    return d ?? null;
  }
  if (!kimlik.slug) return null;
  const hepsi = await db.select().from(schema.journals).orderBy(asc(schema.journals.name));
  return hepsi.find((j) => asciiSlug(j.name) === kimlik.slug) ?? null;
}

/** The newest approved rule version of a journal, or null (nothing unapproved is ever returned). */
export async function onayliKurallar(db: Db, journalId: string): Promise<OnayliKural | null> {
  const surumler = await db
    .select()
    .from(schema.journalRuleVersions)
    .where(eq(schema.journalRuleVersions.journalId, journalId))
    .orderBy(desc(schema.journalRuleVersions.version));
  const onayli = await onayliSurumler(db, surumler);
  for (const s of surumler) {
    if (!onayli.has(s.id)) continue;
    const kayit = paketiCoz(s.rules);
    if (!kayit) continue;
    return { id: s.id, version: s.version, approvedAt: onayli.get(s.id)?.toISOString() ?? null, sourceUrl: s.sourceUrl, kayit };
  }
  return null;
}

export interface TaslakGirdisi {
  name: string;
  issn?: string | null;
  eissn?: string | null;
  publisher?: string | null;
  url?: string | null;
  sourceUrl: string;
  kayit: KuralKaydi;
  model: 'haiku' | 'sonnet';
}

/**
 * Store extracted journal rules as a draft and put it in the editor queue. The draft never shows to users
 * until an editor decides "onay" in /v1/admin/queues/journal-rules.
 */
export async function dergiTaslagiOlustur(db: Db, g: TaslakGirdisi) {
  if (g.kayit.tur !== 'makale') throw new Error('journal rules are article rules');
  let [dergi] = g.issn
    ? await db.select().from(schema.journals).where(eq(schema.journals.issn, g.issn))
    : await db.select().from(schema.journals).where(eq(schema.journals.name, g.name));
  if (!dergi) {
    [dergi] = await db
      .insert(schema.journals)
      .values({ name: g.name, issn: g.issn ?? null, eissn: g.eissn ?? null, publisher: g.publisher ?? null, url: g.url ?? null })
      .returning();
  }
  if (!dergi) throw new Error('journal insert failed');
  const [son] = await db
    .select({ version: schema.journalRuleVersions.version })
    .from(schema.journalRuleVersions)
    .where(eq(schema.journalRuleVersions.journalId, dergi.id))
    .orderBy(desc(schema.journalRuleVersions.version))
    .limit(1);
  const version = (son?.version ?? 0) + 1;
  const paket = paketeCevir(g.kayit);
  const [surum] = await db
    .insert(schema.journalRuleVersions)
    .values({ journalId: dergi.id, version, rules: paket, sourceUrl: g.sourceUrl })
    .returning();
  if (!surum) throw new Error('version insert failed');
  const [kuyruk] = await db
    .insert(schema.reviewQueueItems)
    .values({
      queue: DERGI_KUYRUGU,
      subjectType: 'journal_rule_version',
      subjectId: surum.id,
      payload: { journalId: dergi.id, journal: g.name, version, sourceUrl: g.sourceUrl, model: g.model, rules: paket },
      priority: 0,
    })
    .returning({ id: schema.reviewQueueItems.id });
  return { journalId: dergi.id, versionId: surum.id, version, queueId: kuyruk?.id ?? null };
}
