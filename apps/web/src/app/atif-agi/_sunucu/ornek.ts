import data from '../_veri/ornek-ag.json' with { type: 'json' };
import { bosAg, ozetle } from '../_alan/ag.ts';
import {
  kapsam10,
  tarihAraligi,
  type AgFiltresi,
  type AgKarari,
  type AtifAgi,
  type DisAtif,
  type Eser,
  type EserKenari,
} from '../_alan/tipler.ts';
import type { AtifKaynagi } from './sql.ts';

/**
 * Example source: the extractor's output over the real Yargıtay decisions of packages/casuist/fixtures
 * (eval/citations/ornek_ag_uret.py). For tests, local development and screenshots only; kaynak.ts never
 * selects it in production. The fixture holds no decision that cites another one of its decisions.
 */
const dusur = (s: string | null | undefined): string => (s ?? '').toLocaleLowerCase('tr-TR');

const nodes = data.nodes as AgKarari[];
const works = data.works as Eser[];
const workEdges = data.workEdges as EserKenari[];
const dis = data.externalCitations as DisAtif[];

function kapsamda(n: AgKarari, f: AgFiltresi): boolean {
  const court = dusur(n.court);
  const chamber = dusur(n.chamber);
  if (f.court) {
    if (!court.startsWith(dusur(f.court))) return false;
  } else if (
    !kapsam10.some(
      (k) =>
        court.startsWith(dusur(k.mahkeme)) &&
        (!k.daire || chamber.includes(dusur(k.daire).replace('içtihadı birleştirme', 'birleştirme'))),
    )
  ) {
    return false;
  }
  if (f.chamber && !chamber.includes(dusur(f.chamber))) return false;
  const { from, to } = tarihAraligi(f);
  if (from && (!n.date || n.date < from)) return false;
  if (to && (!n.date || n.date > to)) return false;
  if (f.topic && !dusur(n.title).includes(dusur(f.topic))) return false;
  return true;
}

function kur(secili: AgKarari[], filters: AgFiltresi): AtifAgi {
  const idler = new Set(secili.map((n) => n.id));
  const kullanilanEserler = new Set(workEdges.filter((e) => idler.has(e.from)).map((e) => e.work));
  const ag: AtifAgi = {
    ...bosAg(filters, { kaynak: 'fikstur', doktrinVerisi: true }),
    nodes: secili,
    works: works.filter((w) => kullanilanEserler.has(w.id)),
    workEdges: workEdges.filter((e) => idler.has(e.from)),
    externalCitations: dis.filter((d) => idler.has(d.from)),
  };
  return { ...ag, summary: ozetle(ag) };
}

export const ornekKaynagi: AtifKaynagi = {
  async ag(filtre) {
    return kur(
      nodes.filter((n) => kapsamda(n, filtre)),
      filtre,
    );
  },
  async kayitAgi(id) {
    const n = nodes.find((x) => x.id === id);
    return n ? kur([n], {}) : null;
  },
};
