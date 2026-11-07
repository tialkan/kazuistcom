import type {
  AgFiltresi,
  AgKarari,
  AgMeta,
  AgOzeti,
  AtifAgi,
  DisAtif,
  Eser,
  EserKenari,
  KararKenari,
} from './tipler.ts';

/** Pure functions over the graph. Nothing here touches the network or the clock. */

export type Secim = { tur: 'karar'; id: string } | { tur: 'eser'; id: string } | null;

export interface KararKomsulari {
  eserler: { eser: Eser; sayfalar: string[] }[];
  atifYaptigiKararlar: AgKarari[];
  atifYaptigiDisKararlar: DisAtif[];
  atifYapanKararlar: AgKarari[];
}

export interface EserKomsulari {
  kararlar: { karar: AgKarari; sayfalar: string[] }[];
}

const bul = <T extends { id: string }>(liste: T[], id: string): T | undefined =>
  liste.find((x) => x.id === id);

/** Number of distinct decisions that cite each work (FR-28 "N kararda atıf"). */
export function eserAtifSayilari(ag: Pick<AtifAgi, 'workEdges'>): Map<string, number> {
  const kararlar = new Map<string, Set<string>>();
  for (const e of ag.workEdges) {
    if (!kararlar.has(e.work)) kararlar.set(e.work, new Set());
    kararlar.get(e.work)?.add(e.from);
  }
  return new Map([...kararlar].map(([k, v]) => [k, v.size]));
}

/** Years of the editions that were cited, "1980" or "1980, 1995" (FR-28 "· yıl"). */
export function eserYillari(e: Eser): number[] {
  return [...new Set(e.basklar.map((b) => b.yil).filter((y): y is number => y !== null))].sort(
    (a, b) => a - b,
  );
}

/** Works that more than one decision cites and that share the highest count: the ones FR-28 marks. */
export function cokAtifAlanIdleri(ag: Pick<AtifAgi, 'workEdges'>): Set<string> {
  const sayilar = eserAtifSayilari(ag);
  const enCok = Math.max(0, ...sayilar.values());
  if (enCok < 2) return new Set();
  return new Set([...sayilar].filter(([, n]) => n === enCok).map(([id]) => id));
}

export function ozetle(
  ag: Pick<AtifAgi, 'nodes' | 'edges' | 'works' | 'workEdges' | 'externalCitations'>,
): AgOzeti {
  const sayilar = eserAtifSayilari(ag);
  const enCok = Math.max(0, ...sayilar.values());
  const top = [...sayilar]
    .filter(([, n]) => n === enCok && enCok >= 2) // same rule as the mark in the columns (cokAtifAlanIdleri)
    .map(([id, sayi]) => ({ id, baslik: bul(ag.works, id)?.baslik ?? id, sayi }))
    .sort((a, b) => a.baslik.localeCompare(b.baslik, 'tr-TR'));
  return {
    kararSayisi: ag.nodes.length,
    eserSayisi: ag.works.length,
    doktrinAtfiSayisi: ag.workEdges.length,
    kararAtfiSayisi: ag.edges.length + ag.externalCitations.length,
    enCokAtifAlanlar: top,
  };
}

export function kararKomsulari(ag: AtifAgi, id: string): KararKomsulari {
  const eserler = ag.workEdges
    .filter((e) => e.from === id)
    .flatMap((e) => {
      const eser = bul(ag.works, e.work);
      return eser ? [{ eser, sayfalar: e.sayfalar }] : [];
    });
  const giden = ag.edges.filter((e) => e.from === id).flatMap((e) => bul(ag.nodes, e.to) ?? []);
  const gelen = ag.edges.filter((e) => e.to === id).flatMap((e) => bul(ag.nodes, e.from) ?? []);
  return {
    eserler,
    atifYaptigiKararlar: giden,
    atifYaptigiDisKararlar: ag.externalCitations.filter((d) => d.from === id),
    atifYapanKararlar: gelen,
  };
}

export function eserKomsulari(ag: AtifAgi, id: string): EserKomsulari {
  return {
    kararlar: ag.workEdges
      .filter((e) => e.work === id)
      .flatMap((e) => {
        const karar = bul(ag.nodes, e.from);
        return karar ? [{ karar, sayfalar: e.sayfalar }] : [];
      }),
  };
}

/** Ids connected to the selection, for highlighting. The selection itself is not in the set. */
export function bagliIdler(ag: AtifAgi, secim: Secim): Set<string> {
  if (!secim) return new Set();
  if (secim.tur === 'karar') {
    const k = kararKomsulari(ag, secim.id);
    return new Set([
      ...k.eserler.map((x) => x.eser.id),
      ...k.atifYaptigiKararlar.map((x) => x.id),
      ...k.atifYapanKararlar.map((x) => x.id),
    ]);
  }
  return new Set(eserKomsulari(ag, secim.id).kararlar.map((x) => x.karar.id));
}

/** Drawn lines: decision to work, in the order of the columns. */
export function cizgiler(
  ag: Pick<AtifAgi, 'workEdges'>,
  kararIdleri: Set<string>,
  eserIdleri: Set<string>,
): EserKenari[] {
  return ag.workEdges.filter((e) => kararIdleri.has(e.from) && eserIdleri.has(e.work));
}

/** Citing decisions first by how many works and decisions they cite, then newest. Stable and deterministic. */
export function kararlariSirala(ag: AtifAgi): AgKarari[] {
  const say = (id: string) =>
    ag.workEdges.filter((e) => e.from === id).length +
    ag.edges.filter((e) => e.from === id).length +
    ag.externalCitations.filter((e) => e.from === id).length;
  return [...ag.nodes].sort(
    (a, b) =>
      say(b.id) - say(a.id) ||
      (b.date ?? '').localeCompare(a.date ?? '') ||
      a.title.localeCompare(b.title, 'tr-TR'),
  );
}

export function eserleriSirala(ag: AtifAgi): Eser[] {
  const sayilar = eserAtifSayilari(ag);
  return [...ag.works].sort(
    (a, b) =>
      (sayilar.get(b.id) ?? 0) - (sayilar.get(a.id) ?? 0) || a.baslik.localeCompare(b.baslik, 'tr-TR'),
  );
}

/** One line label of a decision: "Hukuk Genel Kurulu E. 2012/4-179 K. 2012/412". */
export function kunye(k: Pick<AgKarari, 'court' | 'chamber' | 'esasNo' | 'kararNo'>): string {
  const no = [k.esasNo ? `E. ${k.esasNo}` : '', k.kararNo ? `K. ${k.kararNo}` : ''].filter(Boolean).join(' ');
  return [k.chamber ?? k.court ?? '', no].filter(Boolean).join(' ');
}

export function disAtifEtiketi(d: DisAtif): string {
  if (d.numara) return `${d.mahkeme ?? ''} ${d.numara}`.trim();
  const no = [d.esasNo ? `E. ${d.esasNo}` : '', d.kararNo ? `K. ${d.kararNo}` : ''].filter(Boolean).join(' ');
  return [d.daire ?? d.mahkeme ?? '', no].filter(Boolean).join(' ');
}

/** `/ara` query that opens the decision text (casuist resolves E/K strings). */
export function metniAcSorgusu(k: Pick<AgKarari, 'esasNo' | 'kararNo' | 'title'>): string {
  return k.esasNo && k.kararNo ? `E. ${k.esasNo} K. ${k.kararNo}` : k.title;
}

export const bosAg = (filters: AgFiltresi, meta: Partial<AgMeta> = {}): AtifAgi => ({
  nodes: [],
  edges: [],
  works: [],
  workEdges: [],
  externalCitations: [],
  summary: { kararSayisi: 0, eserSayisi: 0, doktrinAtfiSayisi: 0, kararAtfiSayisi: 0, enCokAtifAlanlar: [] },
  filters,
  meta: { kaynak: 'veritabani', doktrinVerisi: false, kuyrukta: 0, yayinEsigi: 0.9, kesildi: false, ...meta },
});

export type { KararKenari };
