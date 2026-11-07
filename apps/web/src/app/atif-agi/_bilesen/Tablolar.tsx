import { Tablo } from '@kazuist/ui';
import { eserAtifSayilari, eserleriSirala, eserYillari, kararlariSirala, kunye } from '../_alan/ag.ts';
import type { AgKarari, AtifAgi, Eser } from '../_alan/tipler.ts';
import { sayfalarMetni, sayiTr, tarihTr, tr } from './metin.ts';

/**
 * Table view: the full, equivalent content of the two column view (plan 10.3, wt: keyboard and screen reader
 * equivalent). Native tables with captions and row headers from @kazuist/ui; nothing is capped here.
 */
export function Tablolar({ ag }: { ag: AtifAgi }) {
  const sayilar = eserAtifSayilari(ag);
  const eserOf = new Map(ag.works.map((w) => [w.id, w]));
  const kararOf = new Map(ag.nodes.map((n) => [n.id, n]));

  const kararSatiri = (k: AgKarari) => {
    const eserler = ag.workEdges
      .filter((e) => e.from === k.id)
      .flatMap((e) => {
        const w = eserOf.get(e.work);
        return w
          ? [
              `${w.yazarlar.join(', ')}: ${w.baslik}${e.sayfalar.length ? ` (${sayfalarMetni(e.sayfalar)})` : ''}`,
            ]
          : [];
      });
    const kararSayisi =
      ag.edges.filter((e) => e.from === k.id).length +
      ag.externalCitations.filter((e) => e.from === k.id).length;
    return { k, eserler, kararSayisi };
  };

  const eserSatiri = (w: Eser) => {
    const kararlar = ag.workEdges
      .filter((e) => e.work === w.id)
      .flatMap((e) => {
        const k = kararOf.get(e.from);
        return k ? [`${kunye(k)}${e.sayfalar.length ? ` (${sayfalarMetni(e.sayfalar)})` : ''}`] : [];
      });
    return { w, kararlar, sayi: sayilar.get(w.id) ?? 0 };
  };

  return (
    <div>
      <Tablo
        baslik={tr.tablo.kararlarBaslik}
        satirlar={kararlariSirala(ag).map(kararSatiri)}
        satirAnahtari={(s) => s.k.id}
        sutunlar={[
          { anahtar: 'karar', baslik: tr.tablo.karar, hucre: (s) => kunye(s.k) },
          {
            anahtar: 'tarih',
            baslik: tr.tablo.tarih,
            hucre: (s) => (s.k.date ? <time dateTime={s.k.date}>{tarihTr(s.k.date)}</time> : ''),
          },
          {
            anahtar: 'eserler',
            baslik: tr.tablo.eserler,
            hucre: (s) =>
              s.eserler.length ? (
                <ul>
                  {s.eserler.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : (
                tr.tablo.atifYok
              ),
          },
          {
            anahtar: 'kararAtfi',
            baslik: tr.tablo.kararAtfi,
            sayisal: true,
            hucre: (s) => sayiTr(s.kararSayisi),
          },
        ]}
      />
      <Tablo
        baslik={tr.tablo.eserlerBaslik}
        satirlar={eserleriSirala(ag).map(eserSatiri)}
        satirAnahtari={(s) => s.w.id}
        sutunlar={[
          { anahtar: 'eser', baslik: tr.tablo.eser, hucre: (s) => s.w.baslik },
          { anahtar: 'yazarlar', baslik: tr.tablo.yazarlar, hucre: (s) => s.w.yazarlar.join(', ') },
          {
            anahtar: 'yil',
            baslik: tr.tablo.yil,
            hucre: (s) => eserYillari(s.w).join(', ') || tr.tablo.yilYok,
          },
          { anahtar: 'sayi', baslik: tr.tablo.kararSayisi, sayisal: true, hucre: (s) => sayiTr(s.sayi) },
          {
            anahtar: 'kararlar',
            baslik: tr.tablo.kararlar,
            hucre: (s) => (
              <ul>
                {s.kararlar.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ),
          },
        ]}
      />
    </div>
  );
}
