'use client';

import { birlesikRapor } from '../_alan/deneme.ts';
import { doldur, sayiTr, tarihTr, tr } from './metin.ts';
import { useDepo } from './useDepo.ts';
import styles from '../pratik.module.css';

/** Subject report over the completed exams of this browser (plan 10.6/3: report by subject), weakest first. */
export function DenemeRaporu() {
  const { depo } = useDepo();
  if (!depo) return <p aria-busy="true">{tr.bugun.yukleniyor}</p>;
  if (depo.denemeler.length === 0) return <p>{tr.hmgs.rapor.yok}</p>;
  const rapor = birlesikRapor(depo.denemeler);
  return (
    <>
      <div className={styles.tabloSar} role="region" aria-label={tr.hmgs.rapor.baslik} tabIndex={0}>
        <table className={styles.tablo}>
          <caption className="kz-gorunmez">{tr.hmgs.rapor.aciklama}</caption>
          <thead>
            <tr>
              <th scope="col">{tr.hmgs.rapor.alan}</th>
              <th scope="col">{tr.hmgs.rapor.dogru}</th>
              <th scope="col">{tr.hmgs.rapor.oran}</th>
            </tr>
          </thead>
          <tbody>
            {rapor.map((a) => (
              <tr key={a.slug}>
                <th scope="row">{a.ad}</th>
                <td>
                  {a.dogru} / {a.toplam}
                </td>
                <td>%{sayiTr(a.oran * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>{tr.hmgs.rapor.denemeler}</h3>
      <ul className={styles.denemeListesi}>
        {depo.denemeler.slice(0, 5).map((d) => (
          <li key={d.tarih}>
            {doldur(tr.hmgs.rapor.denemeSatiri, {
              tarih: tarihTr(d.tarih),
              dogru: d.dogru,
              soru: d.soruSayisi,
              puan: sayiTr(d.puan, 1),
              baraj: d.baraj ? tr.hmgs.rapor.barajGecti : tr.hmgs.rapor.barajKaldi,
            })}
            {d.tam ? '' : ` (${tr.hmgs.rapor.olcek})`}
          </li>
        ))}
      </ul>
    </>
  );
}
