'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import tr from '@kazuist/i18n/tr/kaydettiklerim.json';
import styles from '../kaydettiklerim.module.css';

/** DELETE /api/v1/library/:id, then the server list is refreshed. */
export function KaldirDugmesi({ id, baslikId }: { id: string; baslikId: string }) {
  const router = useRouter();
  const [durum, setDurum] = useState<'bos' | 'gonderiliyor' | 'hata'>('bos');

  async function kaldir() {
    setDurum('gonderiliyor');
    try {
      const res = await fetch(`/api/v1/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.status === 204 || res.status === 404) {
        router.refresh();
        return;
      }
      setDurum('hata');
    } catch {
      setDurum('hata');
    }
  }

  return (
    <span className={styles.kaldir}>
      <button
        type="button"
        className={styles.eylem}
        onClick={kaldir}
        disabled={durum === 'gonderiliyor'}
        aria-describedby={baslikId}
      >
        {durum === 'gonderiliyor' ? tr.liste.kaldiriliyor : tr.liste.kaldir}
      </button>
      <span role="status" aria-live="polite" className={durum === 'hata' ? styles.hataMetni : 'kz-gorunmez'}>
        {durum === 'hata' ? tr.liste.kaldirHata : ''}
      </span>
    </span>
  );
}
