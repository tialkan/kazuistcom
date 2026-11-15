import tr from '@kazuist/i18n/tr/kalemcik.json';
import { KalemcikYuzu } from './KalemcikYuzu.tsx';
import styles from '../kalemcik.module.css';

/**
 * Kalemcik while there is no progress data: the summary is still loading, or the user has no project yet. Neutral is
 * not a fifth tone (docs/istekler/yazma-kalemcik-notr-ton.md): the calm "dusunceli" face is drawn, the tone label and
 * the message line are left out, because nothing can be said about progress that does not exist. While loading the
 * section carries a screen reader status, not a visible line.
 */
export function SakinKoc({ yukleniyor = false }: { yukleniyor?: boolean }) {
  return (
    <section className={styles.bolum} aria-labelledby="k-koc" aria-busy={yukleniyor ? true : undefined}>
      <h2 id="k-koc">{tr.kalemcik.ad}</h2>
      <div className={styles.koc} data-koc="sakin">
        <KalemcikYuzu yuz="dusunceli" />
        {yukleniyor ? (
          <p className={styles.gizli} role="status">
            {tr.kalemcik.yukleniyor}
          </p>
        ) : null}
      </div>
    </section>
  );
}
