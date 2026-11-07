'use client';

import { Dugme } from '@kazuist/ui';
import { yuzde, type Liste } from '../_alan/ilerleme.ts';
import styles from '../rehberler.module.css';
import { doldur, tr, type AdimGorunumu } from './metin.ts';
import { useIlerleme } from './useIlerleme.ts';

/**
 * Numbered steps of the article and thesis guides with a done checkbox per step and a progress bar (FR-32, FR-33).
 * Progress lives in this browser. Everything shown comes from the props, which the server page builds from the
 * validated content files.
 */
export function AdimListesi({
  liste,
  adimlar,
}: {
  liste: Extract<Liste, 'makale' | 'tez'>;
  adimlar: AdimGorunumu[];
}) {
  const { depo, isaretle, temizle, kaydedilemedi } = useIlerleme({ [liste]: adimlar.map((a) => a.id) });
  const biten = new Set(depo?.[liste] ?? []);
  const toplam = adimlar.length;
  const yapilan = biten.size;
  const durum = doldur(tr.ilerleme.durumAdim, { yapilan, toplam });

  return (
    <div>
      <div className={styles.ilerlemeKutusu}>
        <p className={styles.ilerlemeSatiri} aria-live="polite">
          <strong>{durum}</strong>
          <span className={styles.ipucu}>{yuzde(yapilan, toplam)}%</span>
        </p>
        <progress className={styles.cubuk} max={toplam} value={yapilan} aria-label={tr.ilerleme.cubuk}>
          {durum}
        </progress>
        <p className={styles.ipucu}>{tr.ortak.cihazNotu}</p>
        {kaydedilemedi ? (
          <p role="status" className={styles.uyariSatiri}>
            {tr.ilerleme.kaydedilemedi}
          </p>
        ) : null}
        {yapilan > 0 ? (
          <Dugme tur="sessiz" onClick={() => temizle(liste)}>
            {tr.ilerleme.temizle}
          </Dugme>
        ) : null}
      </div>

      <ol className={styles.adimlar} aria-label={tr.adim.listeAdi}>
        {adimlar.map((a) => {
          const tamam = biten.has(a.id);
          const baslikId = `${liste}-${a.id}-baslik`;
          const etiketId = `${liste}-${a.id}-etiket`;
          return (
            <li
              key={a.id}
              id={`${liste}-${a.id}`}
              className={styles.adim}
              data-tamam={tamam ? 'evet' : 'hayir'}
            >
              <h3 id={baslikId} className={styles.adimBaslik}>
                <span className={`${styles.adimNo} kz-mono`}>{doldur(tr.adim.no, { no: a.no })}</span>{' '}
                {a.baslik}
              </h3>
              <p>{a.aciklama}</p>
              {a.ipucu ? (
                <p className={styles.ipucuKutusu}>
                  <strong>{tr.adim.ipucu}</strong> {a.ipucu}
                </p>
              ) : null}
              {a.dayanak ? (
                <p className={styles.dayanak}>
                  <strong>{tr.adim.dayanak}</strong> {a.dayanak.kisa}. {a.dayanak.not}{' '}
                  <span className={styles.rozet}>{tr.tez.rozet[a.dayanak.dogrulama]}</span>
                </p>
              ) : null}
              <div className={styles.adimEylem}>
                <label className={styles.onay} id={etiketId}>
                  <input
                    type="checkbox"
                    checked={tamam}
                    onChange={(e) => isaretle(liste, a.id, e.target.checked)}
                    aria-labelledby={`${etiketId} ${baslikId}`}
                  />
                  <span>{tr.adim.tamamlandi}</span>
                </label>
                {a.baglanti ? (
                  <a className={styles.baglanti} href={a.baglanti.href}>
                    {a.baglanti.etiket}
                  </a>
                ) : null}
                {a.araEtiket ? (
                  <a className={styles.baglanti} href="/ara">
                    {a.araEtiket}
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
