import type { Pool } from 'pg';
import { bosAg, ozetle } from '../_alan/ag.ts';
import {
  tarihAraligi,
  type AgFiltresi,
  type AgKarari,
  type AtifAgi,
  type DisAtif,
  type Eser,
  type EserKenari,
  type KararKenari,
} from '../_alan/tipler.ts';

/**
 * PostgreSQL source of the citation network. Only records that are servable (masked_text present, not hidden)
 * are read. An edge is drawn when an editor confirmed it, or its confidence is at least the publish threshold
 * (services/worker-py/citations/scoring.py PUBLISH_MIN). An editor rejection sets `rejected = true` (contract
 * v1.5, ADR-0035); rejected edges and work citations are never read, whatever their confidence or confirmed flag.
 */
export const YAYIN_ESIGI = 0.9;
export const KARAR_SINIRI = 500;

export interface AtifKaynagi {
  ag(filtre: AgFiltresi): Promise<AtifAgi>;
  /** Neighbourhood of one record; null when the record is missing, hidden or not servable. */
  kayitAgi(id: string): Promise<AtifAgi | null>;
}

/** Escapes LIKE wildcards so a filter value matches literally. */
export const likeKacis = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const KAYIT_ALANLARI = `r.id, r.type, r.title, r.court, r.chamber, r.esas_no, r.karar_no, r.decision_date::text AS date,
  r.authority_class, r.status, r.source_url, r.fetched_at::text AS fetched_at`;
const SERVIS_EDILEBILIR = 'r.hidden_at IS NULL AND r.masked_text IS NOT NULL';
const KENAR_GORUNUR = `(NOT e.rejected AND (e.confirmed OR e.confidence >= $2))`;

interface KayitSatiri {
  id: string;
  type: AgKarari['type'];
  title: string;
  court: string | null;
  chamber: string | null;
  esas_no: string | null;
  karar_no: string | null;
  date: string | null;
  authority_class: AgKarari['authorityClass'];
  status: AgKarari['status'];
  source_url: string | null;
  fetched_at: string | null;
}

export const kayittanDugume = (r: KayitSatiri): AgKarari => ({
  id: r.id,
  type: r.type,
  title: r.title,
  court: r.court,
  chamber: r.chamber,
  esasNo: r.esas_no,
  kararNo: r.karar_no,
  date: r.date,
  authorityClass: r.authority_class,
  status: r.status,
  labels: [],
  sourceUrl: r.source_url,
  fetchedAt: r.fetched_at,
});

/** Builds the WHERE clause of the decision query. No filter means the 1.0 scope (HGK, IBK, AYM). */
export function kararKosulu(f: AgFiltresi): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = [SERVIS_EDILEBILIR, `r.type = 'karar'`];
  if (f.court) {
    where.push(`r.court ILIKE ${p(`${likeKacis(f.court)}%`)}`);
    if (f.chamber) where.push(`r.chamber ILIKE ${p(`%${likeKacis(f.chamber)}%`)}`);
  } else {
    where.push(
      `((r.court ILIKE 'Yargıtay%' AND r.chamber ~* '(hukuk genel kurulu|birleştirme)') OR r.court ILIKE 'Anayasa Mahkemesi%')`,
    );
    if (f.chamber) where.push(`r.chamber ILIKE ${p(`%${likeKacis(f.chamber)}%`)}`);
  }
  const { from, to } = tarihAraligi(f);
  if (from) where.push(`r.decision_date >= ${p(from)}::date`);
  if (to) where.push(`r.decision_date <= ${p(to)}::date`);
  if (f.topic) where.push(`r.title ILIKE ${p(`%${likeKacis(f.topic)}%`)}`);
  return { where: where.join(' AND '), params };
}

const eksikTablo = (err: unknown): boolean => (err as { code?: string } | null)?.code === '42P01';

interface EserSatiri {
  work_id: string;
  from_record_id: string;
  pages: string[] | null;
  title: string;
  authors: string[] | null;
  csl: { kind?: 'kitap' | 'makale'; venue?: string | null; editions?: Eser['basklar'] } | null;
}

/**
 * Doctrine edges come from work_citations (migration 0007). The 42P01 fallback below is no longer needed since the
 * tables exist; it stays as a harmless guard for an environment that has not migrated yet.
 */
async function eserleriOku(
  pool: Pool,
  kararIdleri: string[],
): Promise<{ works: Eser[]; workEdges: EserKenari[]; var: boolean }> {
  if (kararIdleri.length === 0) return { works: [], workEdges: [], var: true };
  try {
    const { rows } = await pool.query<EserSatiri>(
      `SELECT wc.work_id, wc.from_record_id, wc.pages, w.title, w.authors, w.csl
         FROM work_citations wc JOIN works w ON w.id = wc.work_id
        WHERE wc.from_record_id = ANY($1::uuid[]) AND NOT wc.rejected AND (wc.confirmed OR wc.confidence >= $2)`,
      [kararIdleri, YAYIN_ESIGI],
    );
    const works = new Map<string, Eser>();
    const workEdges: EserKenari[] = [];
    for (const r of rows) {
      if (!works.has(r.work_id))
        works.set(r.work_id, {
          id: r.work_id,
          baslik: r.title,
          yazarlar: r.authors ?? [],
          tur: r.csl?.kind ?? 'kitap',
          yayin: r.csl?.venue ?? null,
          basklar: r.csl?.editions ?? [],
        });
      workEdges.push({ from: r.from_record_id, work: r.work_id, sayfalar: r.pages ?? [] });
    }
    return { works: [...works.values()], workEdges, var: true };
  } catch (err) {
    if (eksikTablo(err)) return { works: [], workEdges: [], var: false };
    throw err;
  }
}

interface KenarSatiri {
  from_record_id: string;
  to_record_id: string | null;
  to_raw: string;
  kind: KararKenari['kind'];
}

/** Splits `to_raw` ("2014/4-56|2015/1679" or a number) back into a cited decision without a corpus record. */
export function disAtifa(from: string, toRaw: string): DisAtif {
  const [esas, karar] = toRaw.split('|');
  if (karar !== undefined)
    return {
      from,
      tur: 'yargi',
      mahkeme: null,
      daire: null,
      esasNo: esas ?? null,
      kararNo: karar,
      numara: null,
      tarih: null,
    };
  const tur = /^[CT]-\d/.test(toRaw) ? 'abad' : /^\d{3,6}\/\d{2}$/.test(toRaw) ? 'aihm' : 'aym';
  const mahkeme = tur === 'abad' ? 'ABAD' : tur === 'aihm' ? 'AİHM' : 'Anayasa Mahkemesi';
  return { from, tur, mahkeme, daire: null, esasNo: null, kararNo: null, numara: toRaw, tarih: null };
}

async function kuyrukSayisi(pool: Pool, kararIdleri: string[]): Promise<number> {
  if (kararIdleri.length === 0) return 0;
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM review_queue
      WHERE queue = 'citations' AND decision IS NULL AND payload->>'recordId' = ANY($1::text[])`,
    [kararIdleri],
  );
  return Number(rows[0]?.n ?? 0);
}

async function kenarlariOku(pool: Pool, kararIdleri: string[]) {
  if (kararIdleri.length === 0)
    return { edges: [] as KararKenari[], dis: [] as DisAtif[], hedefIdleri: [] as string[] };
  const { rows } = await pool.query<KenarSatiri>(
    `SELECT e.from_record_id, e.to_record_id, e.to_raw, e.kind FROM citation_edges e
      WHERE e.from_record_id = ANY($1::uuid[]) AND ${KENAR_GORUNUR}`,
    [kararIdleri, YAYIN_ESIGI],
  );
  const edges: KararKenari[] = [];
  const dis: DisAtif[] = [];
  const hedefIdleri = new Set<string>();
  for (const r of rows) {
    if (r.to_record_id) {
      edges.push({ from: r.from_record_id, to: r.to_record_id, kind: r.kind });
      hedefIdleri.add(r.to_record_id);
    } else dis.push(disAtifa(r.from_record_id, r.to_raw));
  }
  return { edges, dis, hedefIdleri: [...hedefIdleri] };
}

async function kayitlariOku(pool: Pool, idler: string[]): Promise<AgKarari[]> {
  if (idler.length === 0) return [];
  const { rows } = await pool.query<KayitSatiri>(
    `SELECT ${KAYIT_ALANLARI} FROM records r WHERE r.id = ANY($1::uuid[]) AND ${SERVIS_EDILEBILIR}`,
    [idler],
  );
  return rows.map(kayittanDugume);
}

function birlestir(
  filters: AgFiltresi,
  nodes: AgKarari[],
  edges: KararKenari[],
  dis: DisAtif[],
  e: Awaited<ReturnType<typeof eserleriOku>>,
  kuyrukta: number,
  kesildi: boolean,
): AtifAgi {
  const goruntulenen = new Set(nodes.map((n) => n.id));
  const ag: AtifAgi = {
    ...bosAg(filters, {
      kaynak: 'veritabani',
      doktrinVerisi: e.var,
      kuyrukta,
      yayinEsigi: YAYIN_ESIGI,
      kesildi,
    }),
    nodes,
    edges: edges.filter((x) => goruntulenen.has(x.from) && goruntulenen.has(x.to)),
    works: e.works,
    workEdges: e.workEdges.filter((x) => goruntulenen.has(x.from)),
    externalCitations: dis.filter((x) => goruntulenen.has(x.from)),
  };
  return { ...ag, summary: ozetle(ag) };
}

export function sqlKaynagi(pool: Pool): AtifKaynagi {
  return {
    async ag(filtre) {
      const { where, params } = kararKosulu(filtre);
      const { rows } = await pool.query<KayitSatiri>(
        `SELECT ${KAYIT_ALANLARI} FROM records r WHERE ${where}
          ORDER BY r.decision_date DESC NULLS LAST, r.id LIMIT ${KARAR_SINIRI + 1}`,
        params,
      );
      const kesildi = rows.length > KARAR_SINIRI;
      const nodes = rows.slice(0, KARAR_SINIRI).map(kayittanDugume);
      const idler = nodes.map((n) => n.id);
      const k = await kenarlariOku(pool, idler);
      const eksik = k.hedefIdleri.filter((id) => !idler.includes(id));
      const hedefler = await kayitlariOku(pool, eksik);
      const tumNodes = [...nodes, ...hedefler];
      const eserler = await eserleriOku(pool, idler);
      return birlestir(filtre, tumNodes, k.edges, k.dis, eserler, await kuyrukSayisi(pool, idler), kesildi);
    },
    async kayitAgi(id) {
      const [kayit] = await kayitlariOku(pool, [id]);
      if (!kayit) return null;
      const { rows } = await pool.query<KenarSatiri>(
        `SELECT e.from_record_id, e.to_record_id, e.to_raw, e.kind FROM citation_edges e
          WHERE (e.from_record_id = $1 OR e.to_record_id = $1) AND ${KENAR_GORUNUR}`,
        [id, YAYIN_ESIGI],
      );
      const komsuIdleri = [
        ...new Set(
          rows.flatMap((r) => [r.from_record_id, r.to_record_id ?? '']).filter((x) => x && x !== id),
        ),
      ];
      const komsular = await kayitlariOku(pool, komsuIdleri);
      const edges = rows
        .filter((r) => r.to_record_id)
        .map((r) => ({ from: r.from_record_id, to: r.to_record_id as string, kind: r.kind }));
      const dis = rows
        .filter((r) => !r.to_record_id && r.from_record_id === id)
        .map((r) => disAtifa(id, r.to_raw));
      const eserler = await eserleriOku(pool, [id]);
      return birlestir({}, [kayit, ...komsular], edges, dis, eserler, await kuyrukSayisi(pool, [id]), false);
    },
  };
}
