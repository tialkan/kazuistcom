import type { components } from '@kazuist/contracts';
import { z } from 'zod';

/**
 * Citation network model (plan 10.3, SRS FR-26..31). `nodes` and `edges` are the contract `CitationGraph`
 * (openapi getCitationNetwork); `works`, `workEdges`, `externalCitations`, `summary` and `meta` are additive
 * fields requested in docs/istekler/atif-agi-sozlesme.md because the contract has no doctrine nodes.
 */
export type RecordSummary = components['schemas']['RecordSummary'];

export type AgKarari = RecordSummary & { sourceUrl?: string | null };

export type KenarTuru = 'atif' | 'bozma' | 'onama' | 'ayni_yonde' | 'aksi_yonde';

export interface KararKenari {
  from: string;
  to: string;
  kind: KenarTuru;
}

export interface EserBaskisi {
  yil: number | null;
  baski: string | null;
  yer: string | null;
  cilt: string | null;
}

/** A doctrine work (book or article); editions are collapsed into one node. */
export interface Eser {
  id: string;
  baslik: string;
  yazarlar: string[];
  tur: 'kitap' | 'makale';
  yayin: string | null;
  basklar: EserBaskisi[];
}

export interface EserKenari {
  from: string;
  work: string;
  sayfalar: string[];
}

/** A cited decision that is not a record of the corpus (no link, no text). */
export interface DisAtif {
  from: string;
  tur: 'yargi' | 'aym' | 'abad' | 'aihm';
  mahkeme: string | null;
  daire: string | null;
  esasNo: string | null;
  kararNo: string | null;
  numara: string | null;
  tarih: string | null;
}

export interface AgOzeti {
  kararSayisi: number;
  eserSayisi: number;
  doktrinAtfiSayisi: number;
  kararAtfiSayisi: number;
  enCokAtifAlanlar: { id: string; baslik: string; sayi: number }[];
}

export interface AgMeta {
  kaynak: 'veritabani' | 'fikstur';
  /** True when doctrine edges were read; false while the work tables do not exist yet. */
  doktrinVerisi: boolean;
  /** Edges below the publish threshold wait in the editor queue and are not drawn. */
  kuyrukta: number;
  yayinEsigi: number;
  kesildi: boolean;
}

export interface AgFiltresi {
  court?: string;
  chamber?: string;
  topic?: string;
  from?: string;
  to?: string;
}

export interface AtifAgi {
  nodes: AgKarari[];
  edges: KararKenari[];
  works: Eser[];
  workEdges: EserKenari[];
  externalCitations: DisAtif[];
  summary: AgOzeti;
  filters: AgFiltresi;
  meta: AgMeta;
}

const Yil = /^\d{4}$/;
const Tarih = /^\d{4}-\d{2}-\d{2}$/;
const kisaMetin = z.string().trim().min(1).max(80);
const tarihAlani = z
  .string()
  .trim()
  .refine((s) => Yil.test(s) || (Tarih.test(s) && !Number.isNaN(Date.parse(s))));

/** Query of GET /v1/citation-network (contract) plus year shorthand for from and to. Strict: unknown keys fail. */
export const FiltreSemasi = z.strictObject({
  court: kisaMetin.optional(),
  chamber: kisaMetin.optional(),
  topic: kisaMetin.optional(),
  from: tarihAlani.optional(),
  to: tarihAlani.optional(),
});

/** "2015" becomes the first or last day of the year; full dates pass through. */
export function tarihAraligi(f: AgFiltresi): { from?: string; to?: string } {
  const from = f.from ? (Yil.test(f.from) ? `${f.from}-01-01` : f.from) : undefined;
  const to = f.to ? (Yil.test(f.to) ? `${f.to}-12-31` : f.to) : undefined;
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

/** Courts and chambers of the 1.0 scope (plan 3/13). The citing decision decides membership. */
export const kapsam10 = [
  { mahkeme: 'Yargıtay', daire: 'Hukuk Genel Kurulu' },
  { mahkeme: 'Yargıtay', daire: 'İçtihadı Birleştirme' },
  { mahkeme: 'Anayasa Mahkemesi', daire: null },
] as const;
