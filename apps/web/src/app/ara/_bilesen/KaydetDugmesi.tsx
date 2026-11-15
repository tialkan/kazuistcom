'use client';

import { useState } from 'react';
import ara from '@kazuist/i18n/tr/ara.json';
import styles from '../ara.module.css';

type Durum = 'bos' | 'gonderiliyor' | 'kaydedildi' | 'hata' | 'giris';

/** Save to Kaydettiklerim (POST /api/v1/library). Signed out visitors get a sign in link instead. */
export function KaydetDugmesi({
  recordId,
  girisVar,
  girisAdresi = '/giris',
  baslik,
  baslikId,
}: {
  recordId: string;
  girisVar: boolean;
  /** Sign in link that returns to this search. */
  girisAdresi?: string;
  baslik: string;
  /** Id of the card title, so every Save button is announced with its record. */
  baslikId: string;
}) {
  const [durum, setDurum] = useState<Durum>(girisVar ? 'bos' : 'giris');
  const [mesaj, setMesaj] = useState('');

  if (durum === 'giris')
    return (
      <a className={styles.eylem} href={girisAdresi} aria-describedby={baslikId}>
        {ara.sonuc.kaydetGiris}
      </a>
    );

  async function kaydet() {
    setDurum('gonderiliyor');
    setMesaj('');
    try {
      const res = await fetch('/api/v1/library', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recordId }),
      });
      if (res.status === 201 || res.status === 409) {
        setDurum('kaydedildi');
        setMesaj(res.status === 409 ? ara.sonuc.zatenKayitli : `${baslik}: ${ara.sonuc.kaydedildi}`);
      } else if (res.status === 401) setDurum('giris');
      else {
        setDurum('hata');
        setMesaj(ara.sonuc.kaydetHata);
      }
    } catch {
      setDurum('hata');
      setMesaj(ara.sonuc.kaydetHata);
    }
  }

  return (
    <span className={styles.kaydet}>
      <button
        type="button"
        className={styles.eylem}
        onClick={kaydet}
        disabled={durum === 'gonderiliyor' || durum === 'kaydedildi'}
        aria-describedby={baslikId}
      >
        {durum === 'gonderiliyor'
          ? ara.sonuc.kaydediliyor
          : durum === 'kaydedildi'
            ? ara.sonuc.kaydedildi
            : ara.sonuc.kaydet}
      </button>
      <span className={durum === 'hata' ? styles.hataMetni : 'kz-gorunmez'} role="status" aria-live="polite">
        {mesaj}
      </span>
    </span>
  );
}
