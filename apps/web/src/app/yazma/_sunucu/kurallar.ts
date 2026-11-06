import { and, eq, sql } from 'drizzle-orm';
import { schema, type Db } from '@/server/auth/db.ts';
import {
  kuralCikar,
  KuralCikarmaHatasi,
  type KuralModeli,
  type KuralCikarmaSonucu,
} from '../_cekirdek/kural-cikarma.ts';
import { kuralAnahtarlari, type KuralKaydi, type SablonTuru } from '../_cekirdek/kural-semasi.ts';
import {
  metinCikar,
  YuklemeHatasi,
  type MetinUyarisi,
  type YuklemeHatasiKodu,
} from '../_cekirdek/metin-cikarma.ts';
import { paketeCevir, paketiCoz } from './dergiler.ts';

/**
 * Guide rule extraction as a job (plan 10.5/2, contract POST /v1/templates/rules): the upload is read in memory,
 * the job row says only who asked and for which kind, and the result holds ids and counts. The file itself is
 * never stored; what stays is the rule set and the verbatim quotes, for RETENTION_DAYS (see ruleRetentionSql in
 * worker-node kalemcik).
 */

export const RETENTION_DAYS = 30;
export const JOB_TYPE = 'rules.extract' as const;

export interface IsSonucu {
  templateRuleId: string | null;
  model: 'haiku' | 'sonnet' | null;
  sonnetYedegi: boolean;
  dusenler: { anahtar: string; neden: string }[];
  uyarilar: MetinUyarisi[];
  institutionName: string | null;
}

export type HataKodu = YuklemeHatasiKodu | 'sema' | 'model' | 'bos_metin';

/** Creates the job row in the running state; the web process finishes it. Returns the id. */
export async function isOlustur(
  db: Db,
  userId: string,
  kind: SablonTuru,
  tekrarAnahtari?: string,
): Promise<{ id: string; yeni: boolean }> {
  const dedupe = tekrarAnahtari ? `rules.extract:${userId}:${tekrarAnahtari.slice(0, 100)}` : null;
  if (dedupe) {
    // The same Idempotency-Key answers with the same job even after it finished (the unique index only
    // covers jobs that are still queued or running).
    const [onceki] = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.type, JOB_TYPE), eq(schema.jobs.dedupeKey, dedupe)));
    if (onceki) return { id: onceki.id, yeni: false };
  }
  const rows = await db
    .insert(schema.jobs)
    .values({
      type: JOB_TYPE,
      payload: { userId, kind },
      status: 'running',
      attempts: 1,
      lockedBy: 'web',
      lockedAt: new Date(),
      dedupeKey: dedupe,
    })
    .onConflictDoNothing()
    .returning({ id: schema.jobs.id });
  const r = rows[0];
  if (r) return { id: r.id, yeni: true };
  const [var_] = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.type, JOB_TYPE), eq(schema.jobs.dedupeKey, dedupe ?? '')));
  if (!var_) throw new Error('job insert failed');
  return { id: var_.id, yeni: false };
}

async function isiBitir(
  db: Db,
  id: string,
  durum: 'done' | 'failed',
  sonuc: IsSonucu | null,
  hata?: HataKodu,
) {
  await db
    .update(schema.jobs)
    .set({ status: durum, result: sonuc, error: hata ?? null, lockedBy: null, lockedAt: null })
    .where(eq(schema.jobs.id, id));
}

/** Persist the extracted rules and their quotes; unapproved and owned by the user. */
export async function kuralKaydet(
  db: Db,
  userId: string,
  sonuc: KuralCikarmaSonucu,
  kurum: string | null,
): Promise<string> {
  const paket = { ...paketeCevir(sonuc.kayit), tur: sonuc.kayit.tur, institutionName: kurum };
  const [r] = await db
    .insert(schema.templateRules)
    .values({ userId, rules: paket, model: sonuc.model, approved: false })
    .returning({ id: schema.templateRules.id });
  if (!r) throw new Error('insert failed');
  const kanitlar = kuralAnahtarlari.flatMap((k) => {
    const kanit = sonuc.kayit.kanitlar[k];
    return kanit && sonuc.kayit.kaynaklar[k] === 'kilavuz'
      ? [{ templateRuleId: r.id, ruleKey: k, excerpt: kanit.alinti, page: kanit.sayfa }]
      : [];
  });
  if (kanitlar.length) await db.insert(schema.templateRuleEvidence).values(kanitlar);
  return r.id;
}

export interface CikarmaGirdisi {
  jobId: string;
  userId: string;
  kind: SablonTuru;
  bayt: Uint8Array;
  dosyaAdi: string;
  kurum: string | null;
  model: KuralModeli;
}

/**
 * Run one extraction and close the job. Never throws: failures become a `failed` job whose error is a stable
 * code, so the poller can show a message. The text is dropped when this function returns.
 */
export async function cikarmayiCalistir(db: Db, g: CikarmaGirdisi): Promise<void> {
  try {
    const metin = await metinCikar(g.bayt, g.dosyaAdi);
    if (metin.uyarilar.length) {
      // Almost no text: nothing to extract and nothing worth a paid model call.
      await isiBitir(db, g.jobId, 'done', {
        templateRuleId: null,
        model: null,
        sonnetYedegi: false,
        dusenler: [],
        uyarilar: metin.uyarilar,
        institutionName: g.kurum,
      });
      return;
    }
    const sonuc = await kuralCikar(metin.sayfalar, g.kind, g.model);
    const id = await kuralKaydet(db, g.userId, sonuc, g.kurum);
    await isiBitir(db, g.jobId, 'done', {
      templateRuleId: id,
      model: sonuc.model,
      sonnetYedegi: sonuc.sonnetYedegi,
      dusenler: sonuc.dusenler,
      uyarilar: [],
      institutionName: g.kurum,
    });
  } catch (e) {
    const kod: HataKodu =
      e instanceof YuklemeHatasi ? e.kod : e instanceof KuralCikarmaHatasi ? e.kod : 'model';
    console.error(
      JSON.stringify({
        at: 'rules.extract',
        level: 'warn',
        error: e instanceof Error ? e.name : 'Unknown',
        kod,
      }),
    );
    await isiBitir(db, g.jobId, 'failed', null, kod);
  }
}

export interface IsDurumu {
  id: string;
  type: string;
  status: string;
  result: unknown;
  error: string | null;
}

/** Job status for its owner only (payload.userId); anyone else gets null, like a missing job. */
export async function isiGetir(db: Db, userId: string, id: string): Promise<IsDurumu | null> {
  const [r] = await db
    .select({
      id: schema.jobs.id,
      type: schema.jobs.type,
      status: schema.jobs.status,
      result: schema.jobs.result,
      error: schema.jobs.error,
    })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, id), sql`${schema.jobs.payload} ->> 'userId' = ${userId}`));
  return r ?? null;
}

export async function kayitGetir(
  db: Db,
  userId: string,
  id: string,
): Promise<{
  id: string;
  model: string | null;
  createdAt: Date;
  kayit: KuralKaydi;
  institutionName: string | null;
} | null> {
  const [r] = await db
    .select()
    .from(schema.templateRules)
    .where(and(eq(schema.templateRules.id, id), eq(schema.templateRules.userId, userId)));
  if (!r) return null;
  const raw = r.rules as { institutionName?: string | null };
  const kayit = paketiCoz(r.rules);
  if (!kayit) return null;
  return {
    id: r.id,
    model: r.model,
    createdAt: r.createdAt,
    kayit,
    institutionName: raw.institutionName ?? null,
  };
}

export async function kayitSil(db: Db, userId: string, id: string): Promise<boolean> {
  const silinen = await db
    .delete(schema.templateRules)
    .where(
      and(
        eq(schema.templateRules.id, id),
        eq(schema.templateRules.userId, userId),
        eq(schema.templateRules.approved, false),
      ),
    )
    .returning({ id: schema.templateRules.id });
  return silinen.length > 0;
}
