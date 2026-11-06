'use client';

import { useEffect, useRef } from 'react';
import type { KartGorunumu } from '../_alan/kart.ts';
import { DogruIsareti, YanlisIsareti } from './Isaretler.tsx';
import { doldur, tarihTr, tr } from './metin.ts';
import styles from '../pratik.module.css';

interface Props {
  kart: KartGorunumu;
  secim: number;
  kimlik: string;
  /** Moves focus to this block when it appears, so a keyboard or screen reader user lands on the result. */
  odakla?: boolean;
}

/** FR-58: a mark that does not depend on color, the explanation, the source and the quotation from the law. */
export function Geribildirim({ kart, secim, kimlik, odakla = true }: Props) {
  const ref = useRef<HTMLElement>(null);
  const dogru = secim === kart.dogruIndex;
  useEffect(() => {
    if (odakla) ref.current?.focus();
  }, [odakla, kart.id]);
  const baslikKimligi = `${kimlik}-geri`;
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={baslikKimligi}
      className={`${styles.geri} ${dogru ? styles.geriDogru : styles.geriYanlis}`}
      data-sonuc={dogru ? 'dogru' : 'yanlis'}
    >
      <h3 id={baslikKimligi} className={styles.geriBaslik}>
        {dogru ? <DogruIsareti /> : <YanlisIsareti />}
        <span>{dogru ? tr.geri.dogru : tr.geri.yanlis}</span>
      </h3>
      {!dogru ? (
        <p>
          {tr.geri.dogruSecenek}: <strong>{kart.secenekler[kart.dogruIndex]}</strong>
        </p>
      ) : null}
      <h4>{tr.geri.aciklama}</h4>
      <p>{kart.aciklama}</p>
      <h4>{tr.geri.kaynak}</h4>
      <ul className={styles.kanunListesi}>
        {kart.kanun.map((k, i) => (
          <li key={i}>
            <p className={styles.kanunKunye}>{k.ref}</p>
            <blockquote className={styles.alinti}>
              <p>{k.metin}</p>
            </blockquote>
          </li>
        ))}
      </ul>
      {kart.kaynakDogrulama ? (
        <p className={styles.dogrulama}>
          {doldur(tr.geri.dogrulama, { tarih: tarihTr(kart.kaynakDogrulama) })}
        </p>
      ) : null}
      <p className={styles.baglantilar}>
        {kart.baglantilar.map((b) => (
          <a key={b.url} href={b.url} target="_blank" rel="noopener noreferrer">
            {tr.geri.ac}: {b.etiket}
            <span className="kz-gorunmez"> ({tr.geri.yeniSekme})</span>
          </a>
        ))}
      </p>
    </section>
  );
}
