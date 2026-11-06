'use client';

import { useEffect, useRef } from 'react';
import type { KartGorunumu } from '../_alan/kart.ts';
import { DogruIsareti, SeciliIsareti, YanlisIsareti } from './Isaretler.tsx';
import { oyunMetni, tr } from './metin.ts';
import styles from '../pratik.module.css';

interface Props {
  kart: KartGorunumu;
  /** Index of the chosen option, or null. */
  secili: number | null;
  /** Reveal which option is right and which was wrong (after an answer in the games). */
  goster: boolean;
  /** Choices are locked (after the answer). */
  kilitli: boolean;
  onSec: (i: number) => void;
  /** Unique prefix for element ids on the page. */
  kimlik: string;
  /** Moves focus to the question text when the card changes. */
  odakla?: boolean;
}

const HEDEF_ETIKETLERI = ['input', 'textarea', 'select'];

/**
 * One question card in the layout of its game. Choices are native buttons: Tab and Enter work, and the keys 1 to 5
 * choose too. Right and wrong are shown with a mark and text, never by color alone.
 */
export function KartSorusu({ kart, secili, goster, kilitli, onSec, kimlik, odakla = false }: Props) {
  const soruRef = useRef<HTMLDivElement>(null);
  const oyun = oyunMetni(kart.oyun);

  useEffect(() => {
    if (odakla) soruRef.current?.focus();
  }, [odakla, kart.id]);

  useEffect(() => {
    if (kilitli) return;
    const tus = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const hedef = e.target as HTMLElement | null;
      if (hedef && (HEDEF_ETIKETLERI.includes(hedef.tagName.toLowerCase()) || hedef.isContentEditable))
        return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= kart.secenekler.length) {
        e.preventDefault();
        onSec(n - 1);
      }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [kilitli, kart.secenekler.length, onSec]);

  const soruKimligi = `${kimlik}-soru`;
  return (
    <div className={`${styles.kart} ${styles[`oyun_${kart.oyun}`]}`} data-oyun={kart.oyun}>
      <p className={styles.oyunEtiketi}>{oyun.ad}</p>
      <p className={styles.yonerge}>{oyun.yonerge}</p>
      <div id={soruKimligi} ref={soruRef} tabIndex={-1} className={styles.soru}>
        {kart.soru}
      </div>
      <div
        role="group"
        aria-labelledby={soruKimligi}
        className={`${styles.secenekler} ${styles[`sec_${kart.oyun}`]}`}
      >
        {kart.secenekler.map((metin, i) => {
          const dogruMu = i === kart.dogruIndex;
          const secildi = secili === i;
          const durum = goster
            ? dogruMu
              ? 'dogru'
              : secildi
                ? 'yanlis'
                : 'sade'
            : secildi
              ? 'secili'
              : 'sade';
          return (
            <button
              key={i}
              type="button"
              className={`${styles.secenek} ${styles[`secenek_${durum}`]}`}
              aria-pressed={secildi}
              aria-disabled={kilitli}
              data-durum={durum}
              onClick={() => {
                if (!kilitli) onSec(i);
              }}
            >
              <span className={styles.secenekNo} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.secenekMetni}>
                <span className="kz-gorunmez">{tr.secenek.numara.replace('{no}', String(i + 1))}: </span>
                {metin}
              </span>
              {durum === 'dogru' ? (
                <span className={styles.secenekIsareti}>
                  <DogruIsareti />
                  <span>{tr.secenek.dogruIsareti}</span>
                </span>
              ) : null}
              {durum === 'yanlis' ? (
                <span className={styles.secenekIsareti}>
                  <YanlisIsareti />
                  <span>{tr.secenek.yanlisIsareti}</span>
                </span>
              ) : null}
              {durum === 'secili' ? (
                <span className={styles.secenekIsareti}>
                  <SeciliIsareti />
                  <span>{tr.secenek.secili}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {!kilitli ? (
        <p className={styles.ipucu}>{tr.tur.secenekIpucu.replace('{son}', String(kart.secenekler.length))}</p>
      ) : null}
    </div>
  );
}
