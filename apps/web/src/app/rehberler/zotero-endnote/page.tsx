import type { Metadata } from 'next';
import { EtikKutusu } from '../_bilesen/EtikKutusu.tsx';
import { KaynakListesi, RehberUst, SabitNotlar } from '../_bilesen/Ortak.tsx';
import { tr } from '../_bilesen/metin.ts';
import { zoteroEndnote as z } from '../_veri/rehberler.ts';
import type { Adim } from '../_alan/sema.ts';
import styles from '../rehberler.module.css';

export const metadata: Metadata = {
  title: tr.meta.zoteroBaslik,
  description: tr.meta.zoteroAciklama,
};

function Adimlar({ baslikId, baslik, adimlar }: { baslikId: string; baslik: string; adimlar: Adim[] }) {
  return (
    <section className={styles.bolum} aria-labelledby={baslikId}>
      <h2 id={baslikId}>{baslik}</h2>
      <ol className={styles.adimlar}>
        {adimlar.map((a, i) => (
          <li key={a.id} id={a.id} className={styles.adim}>
            <h3 className={styles.adimBaslik}>
              <span className={`${styles.adimNo} kz-mono`}>{i + 1}.</span> {a.baslik}
            </h3>
            <p>{a.aciklama}</p>
            {a.ipucu ? (
              <p className={styles.ipucuKutusu}>
                <strong>{tr.adim.ipucu}</strong> {a.ipucu}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function ZoteroEndnoteSayfasi() {
  return (
    <div className="sayfa">
      <RehberUst baslik={z.baslik} giris={z.ozet} guncelleme={z.guncelleme} aktif="zotero" />
      <EtikKutusu />

      <p className={styles.ipucu}>
        <strong>{tr.zotero.arayuz}.</strong> {z.arayuzNotu}
      </p>

      <section className={styles.bolum} aria-labelledby="karsilastirma-baslik">
        <h2 id="karsilastirma-baslik">{z.karsilastirmaBaslik}</h2>
        <div className="kz-tablo" role="region" aria-label={z.karsilastirmaBaslik} tabIndex={0}>
          <table>
            <caption>{z.karsilastirmaBaslik}</caption>
            <thead>
              <tr>
                <th scope="col">{tr.zotero.karsilastirma.ozellik}</th>
                <th scope="col">{tr.zotero.karsilastirma.zotero}</th>
                <th scope="col">{tr.zotero.karsilastirma.endnote}</th>
              </tr>
            </thead>
            <tbody>
              {z.karsilastirma.map((s) => (
                <tr key={s.ozellik}>
                  <th scope="row">{s.ozellik}</th>
                  <td>{s.zotero}</td>
                  <td>{s.endnote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Adimlar baslikId="zotero-baslik" baslik={z.zotero.baslik} adimlar={z.zotero.adimlar} />
      <Adimlar baslikId="endnote-baslik" baslik={z.endnote.baslik} adimlar={z.endnote.adimlar} />

      <section className={styles.bolum} aria-labelledby="oneri-baslik">
        <h2 id="oneri-baslik">{tr.zotero.oneriBaslik}</h2>
        <dl className={styles.oneriler}>
          {z.oneriler.map((o) => (
            <div key={o.baslik}>
              <dt>{o.baslik}</dt>
              <dd>{o.metin}</dd>
            </div>
          ))}
        </dl>
      </section>

      <KaynakListesi baslik={tr.zotero.kaynakBaslik} kaynaklar={z.kaynaklar} />
      <SabitNotlar />
    </div>
  );
}
