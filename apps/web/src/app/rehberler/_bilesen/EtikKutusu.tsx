import { ortak } from '@kazuist/i18n';
import styles from '../rehberler.module.css';
import { etik } from '../_veri/rehberler.ts';
import { doldur, tarihTr, tr } from './metin.ts';

/**
 * Academic integrity box (FR-37). It sits at the top of every guide view: the six violations of the YÖK directive
 * with the definition word for word and an example from law. `acik` opens the details by default (the ethics page).
 */
export function EtikKutusu({
  acik = false,
  sayfaBaglantisi = true,
}: {
  acik?: boolean;
  sayfaBaglantisi?: boolean;
}) {
  const uyari = ortak().uyari;
  return (
    <aside className={styles.etikKutusu} aria-labelledby="etik-kutu-baslik">
      <h2 id="etik-kutu-baslik">{tr.etik.kutuBaslik}</h2>
      <p>{tr.etik.kutuMetin}</p>
      <p className={styles.sabitUyari}>
        {uyari.intihal} {uyari.danismanlik}
      </p>
      <details open={acik}>
        <summary>{tr.etik.ac}</summary>
        <ol className={styles.ihlaller} aria-label={tr.etik.ihlalListesi}>
          {etik.ihlaller.map((i) => (
            <li key={i.id} id={i.id} className={styles.ihlal}>
              <h3>
                {i.ad} <span className={`${styles.ipucu} kz-mono`}>{i.fikra}</span>
              </h3>
              <p>
                <strong>{tr.etik.tanim}</strong> {i.tanim}
              </p>
              <p>
                <strong>{tr.etik.ornek}</strong> {i.ornek}
              </p>
              <p>
                <strong>{tr.etik.korunma}</strong> {i.korunma}
              </p>
            </li>
          ))}
        </ol>
        <p className={styles.ipucu}>{etik.ornekNotu}</p>
        <p>{etik.ekNot}</p>
        <p className={styles.ipucu}>{etik.yaptirimNotu}</p>
        <p className={styles.ipucu}>
          {tr.etik.kaynak}:{' '}
          <a href={etik.kaynak.url} rel="noopener noreferrer">
            {etik.kaynak.ad}
          </a>
          , {doldur(tr.etik.okuma, { tarih: tarihTr(etik.kaynak.okuma) })}
        </p>
      </details>
      {sayfaBaglantisi ? (
        <p>
          <a href="/rehberler/etik" className={styles.baglanti}>
            {tr.etik.sayfa}
          </a>
        </p>
      ) : null}
    </aside>
  );
}
