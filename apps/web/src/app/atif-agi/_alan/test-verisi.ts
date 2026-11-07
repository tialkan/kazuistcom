import { bosAg, ozetle } from './ag.ts';
import type { AgKarari, AtifAgi, Eser } from './tipler.ts';

/** SYNTHETIC graph for tests: titles say so, nothing here is a real decision or book. */
export function sentetikAg(kararSayisi = 6, eserSayisi = 4): AtifAgi {
  const nodes: AgKarari[] = Array.from({ length: kararSayisi }, (_, i) => ({
    id: `k${i + 1}`,
    type: 'karar',
    title: `Sentetik karar ${i + 1}`,
    court: 'Yargıtay',
    chamber: 'Hukuk Genel Kurulu',
    esasNo: `2014/${i + 1}-${10 + i}`,
    kararNo: `2015/${100 + i}`,
    date: `2015-0${(i % 9) + 1}-15`,
    authorityClass: 'yuksek_emsal',
    status: 'bilinmiyor',
    labels: [],
    sourceUrl: `https://example.invalid/k${i + 1}`,
  }));
  const works: Eser[] = Array.from({ length: eserSayisi }, (_, i) => ({
    id: `e${i + 1}`,
    baslik: `Sentetik eser ${i + 1}`,
    yazarlar: [`Yazar${i + 1}, A.`],
    tur: i % 2 ? 'makale' : 'kitap',
    yayin: null,
    basklar: [{ yil: 1990 + i, baski: String(i + 1), yer: 'İstanbul', cilt: null }],
  }));
  // e1 is cited by every decision, e2 by the first two, e3 and e4 by one each
  const workEdges = [
    ...nodes.map((n) => ({ from: n.id, work: 'e1', sayfalar: ['10'] })),
    { from: 'k1', work: 'e2', sayfalar: ['5', '6'] },
    { from: 'k2', work: 'e2', sayfalar: ['7'] },
    ...(eserSayisi >= 3 ? [{ from: 'k3', work: 'e3', sayfalar: ['1'] }] : []),
    ...(eserSayisi >= 4 ? [{ from: 'k4', work: 'e4', sayfalar: ['2'] }] : []),
  ].filter((e) => works.some((w) => w.id === e.work) && nodes.some((n) => n.id === e.from));
  const ag: AtifAgi = {
    ...bosAg({}, { doktrinVerisi: true }),
    nodes,
    works,
    workEdges,
    edges: nodes.length > 1 ? [{ from: 'k2', to: 'k1', kind: 'atif' }] : [],
    externalCitations: [
      {
        from: 'k1',
        tur: 'yargi',
        mahkeme: 'Yargıtay',
        daire: 'Hukuk Genel Kurulu',
        esasNo: '2013/19-199',
        kararNo: '2013/1418',
        numara: null,
        tarih: null,
      },
    ],
  };
  return { ...ag, summary: ozetle(ag) };
}
