'use client';

import { useEffect, useState } from 'react';
import { Dugme, FormAlani } from '@kazuist/ui';
import tr from '@kazuist/i18n/tr/tespit.json';
import { panoyaKopyala } from './kopyala.ts';
import styles from '../tespit.module.css';

const t = tr.istem;
const YEDEK_ID = 'tespit-istem-yedek';

/**
 * One click copy of the whole prompt. The outcome is announced in a polite live region that exists from the
 * first render. Without clipboard access the full text appears selected in a textarea (fallback).
 */
export function KopyalaDugmesi({ istem, indirHref }: { istem: string; indirHref: string }) {
  const [mesaj, setMesaj] = useState('');
  const [yedek, setYedek] = useState(false);
  const [sayac, setSayac] = useState(0);

  async function kopyala() {
    setMesaj('');
    const sonuc = await panoyaKopyala(
      istem,
      typeof navigator === 'undefined' ? undefined : navigator.clipboard,
    );
    setMesaj(sonuc === 'basarili' ? t.kopyalandi : t.kopyalanamadi);
    if (sonuc === 'basarisiz') setYedek(true);
    setSayac((n) => n + 1);
  }

  // Select the fallback text after it is rendered so Ctrl+C copies everything.
  useEffect(() => {
    if (!yedek) return;
    const alan = document.getElementById(YEDEK_ID);
    if (alan instanceof HTMLTextAreaElement) {
      alan.focus();
      alan.select();
    }
  }, [yedek, sayac]);

  return (
    <div className={styles.istemEylem}>
      <div className={styles.dugmeSirasi}>
        <Dugme onClick={kopyala}>{t.kopyala}</Dugme>
        <Dugme tur="ikincil" href={indirHref} download="kazuist-yazim-kurallari.md">
          {t.indir}
        </Dugme>
      </div>
      <p className={styles.durum} role="status" aria-live="polite" aria-atomic="true">
        {mesaj}
      </p>
      {yedek ? (
        <FormAlani
          id={YEDEK_ID}
          etiket={t.yedekEtiket}
          ipucu={t.yedekIpucu}
          cokSatir
          readOnly
          rows={14}
          value={istem}
          className={styles.yedek}
        />
      ) : null}
    </div>
  );
}
