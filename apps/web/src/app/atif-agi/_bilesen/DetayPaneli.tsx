import { Dugme } from '@kazuist/ui';
import {
  disAtifEtiketi,
  eserKomsulari,
  eserYillari,
  kararKomsulari,
  kunye,
  metniAcSorgusu,
  type Secim,
} from '../_alan/ag.ts';
import type { AtifAgi } from '../_alan/tipler.ts';
import { doldur, sayfalarMetni, tarihTr, tr } from './metin.ts';
import styles from '../atif-agi.module.css';

/**
 * Detail panel (FR-29, FR-30). Server renderable: the select callback is optional, so the same markup serves
 * the interactive view and the static render in tests. Every neighbour is a real button or a link.
 */
export function DetayPaneli({
  ag,
  secim,
  onSec,
  baslikRef,
}: {
  ag: AtifAgi;
  secim: Secim;
  onSec?: (s: Secim) => void;
  baslikRef?: React.Ref<HTMLHeadingElement>;
}) {
  const sec = (s: Secim) => (onSec ? () => onSec(s) : undefined);
  if (!secim) {
    return (
      <div className={styles.detay}>
        <h3 id="detay-baslik" tabIndex={-1} ref={baslikRef}>
          {tr.detay.baslik}
        </h3>
        <p>{tr.detay.bos}</p>
      </div>
    );
  }

  if (secim.tur === 'karar') {
    const k = ag.nodes.find((n) => n.id === secim.id);
    if (!k) return null;
    const kom = kararKomsulari(ag, secim.id);
    return (
      <div className={styles.detay}>
        <h3 id="detay-baslik" tabIndex={-1} ref={baslikRef}>
          {k.title}
        </h3>
        <dl className={styles.kunye}>
          <dt>{tr.detay.mahkeme}</dt>
          <dd>{kunye(k)}</dd>
          {k.date ? (
            <>
              <dt>{tr.detay.tarih}</dt>
              <dd>
                <time dateTime={k.date}>{tarihTr(k.date)}</time>
              </dd>
            </>
          ) : null}
        </dl>
        <p className={styles.eylemler}>
          <Dugme tur="ikincil" href={`/ara?q=${encodeURIComponent(metniAcSorgusu(k))}`}>
            {tr.detay.metniAc}
          </Dugme>
          {k.sourceUrl ? (
            <Dugme tur="sessiz" href={k.sourceUrl} rel="noopener noreferrer">
              {tr.detay.kaynagaGit}
            </Dugme>
          ) : null}
        </p>

        <h4>{tr.detay.atifYaptigiEserler}</h4>
        {kom.eserler.length === 0 ? (
          <p>{tr.detay.yok}</p>
        ) : (
          <ul className={styles.liste}>
            {kom.eserler.map(({ eser, sayfalar }) => (
              <li key={eser.id}>
                <button type="button" className={styles.baglanti} onClick={sec({ tur: 'eser', id: eser.id })}>
                  {eser.yazarlar.join(', ')}: {eser.baslik}
                </button>
                {sayfalar.length ? <span className={styles.ipucu}> ({sayfalarMetni(sayfalar)})</span> : null}
              </li>
            ))}
          </ul>
        )}

        <h4>{tr.detay.atifYaptigiKararlar}</h4>
        {kom.atifYaptigiKararlar.length + kom.atifYaptigiDisKararlar.length === 0 ? (
          <p>{tr.detay.yok}</p>
        ) : (
          <ul className={styles.liste}>
            {kom.atifYaptigiKararlar.map((x) => (
              <li key={x.id}>
                <button type="button" className={styles.baglanti} onClick={sec({ tur: 'karar', id: x.id })}>
                  {kunye(x)}
                </button>
              </li>
            ))}
            {kom.atifYaptigiDisKararlar.map((d, i) => (
              <li key={`${d.esasNo ?? d.numara}-${i}`}>
                {disAtifEtiketi(d)} <span className={styles.ipucu}>({tr.detay.corpustaYok})</span>
              </li>
            ))}
          </ul>
        )}

        <h4>{tr.detay.atifYapanKararlar}</h4>
        {kom.atifYapanKararlar.length === 0 ? (
          <p>{tr.detay.yok}</p>
        ) : (
          <ul className={styles.liste}>
            {kom.atifYapanKararlar.map((x) => (
              <li key={x.id}>
                <button type="button" className={styles.baglanti} onClick={sec({ tur: 'karar', id: x.id })}>
                  {kunye(x)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const eser = ag.works.find((w) => w.id === secim.id);
  if (!eser) return null;
  const kom = eserKomsulari(ag, secim.id);
  const yillar = eserYillari(eser);
  return (
    <div className={styles.detay}>
      <h3 id="detay-baslik" tabIndex={-1} ref={baslikRef}>
        {eser.baslik}
      </h3>
      <dl className={styles.kunye}>
        <dt>{tr.detay.yazarlar}</dt>
        <dd>{eser.yazarlar.join(', ')}</dd>
        <dt>{tr.detay.tur}</dt>
        <dd>
          {eser.tur === 'makale' ? tr.detay.makale : tr.detay.kitap}
          {eser.yayin ? `, ${eser.yayin}` : ''}
        </dd>
        {eser.basklar.length ? (
          <>
            <dt>{tr.detay.basklar}</dt>
            <dd>
              {eser.basklar
                .map((b) =>
                  [
                    b.yer,
                    b.yil,
                    b.baski ? doldur(tr.detay.baski, { baski: b.baski }) : '',
                    b.cilt ? doldur(tr.detay.cilt, { cilt: b.cilt }) : '',
                  ]
                    .filter(Boolean)
                    .join(' '),
                )
                .join('; ')}
            </dd>
          </>
        ) : null}
      </dl>
      <p className={styles.ipucu}>
        {doldur(tr.ag.kararda, { sayi: kom.kararlar.length })}
        {yillar.length ? ` · ${doldur(tr.ag.yil, { yil: yillar.join(', ') })}` : ''}
      </p>
      <h4>{tr.detay.atifYapanKararlarEser}</h4>
      <ul className={styles.liste}>
        {kom.kararlar.map(({ karar, sayfalar }) => (
          <li key={karar.id}>
            <button type="button" className={styles.baglanti} onClick={sec({ tur: 'karar', id: karar.id })}>
              {kunye(karar)}
            </button>
            {sayfalar.length ? <span className={styles.ipucu}> ({sayfalarMetni(sayfalar)})</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
