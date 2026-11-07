'use client';

import { useState } from 'react';
import tr from '@kazuist/i18n/tr/yazma.json';
import { Dugme } from '@kazuist/ui';
import { sablonDosyaAdi } from '../_cekirdek/dosya-adi.ts';
import { degerleriDogrula, type KuralKaydi } from '../_cekirdek/kural-semasi.ts';
import { DOCX_TIPI, doldur, dosyaIndir } from './yardimci.ts';
import styles from '../yazma.module.css';

const t = tr.sablon.adim3;

/** Download button of a journal profile: builds the article template in the browser from the approved rules. */
export function SablonIndirme({ kayit, ad }: { kayit: KuralKaydi; ad: string }) {
  const [durum, setDurum] = useState('');
  const [hata, setHata] = useState('');

  async function indir() {
    setHata('');
    setDurum(t.hazirlaniyor);
    const d = degerleriDogrula(kayit.degerler);
    if (!d.ok) {
      setDurum('');
      setHata(t.hata);
      return;
    }
    try {
      const { sablonUret } = await import('../_cekirdek/docx-uret.ts');
      const bayt = await sablonUret(d.degerler, kayit.tur);
      const dosya = sablonDosyaAdi(kayit.tur, ad);
      dosyaIndir(bayt, dosya, DOCX_TIPI);
      setDurum(doldur(t.indirildi, { ad: dosya }));
    } catch {
      setDurum('');
      setHata(t.hata);
    }
  }

  return (
    <div>
      <p className={styles.okuma}>{t.ipucu}</p>
      <div className={styles.eylemler}>
        <Dugme onClick={indir}>{tr.dergi.sablonIndir}</Dugme>
      </div>
      <p className={styles.durum} role="status" aria-live="polite">
        {durum}
      </p>
      {hata ? (
        <p className={`${styles.kutu} ${styles.kutuHata}`} role="alert">
          {hata}
        </p>
      ) : null}
    </div>
  );
}
