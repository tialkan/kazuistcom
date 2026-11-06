'use client';

import { useRef, useState } from 'react';
import tr from '@kazuist/i18n/tr/kaydettiklerim.json';
import { Dugme } from '@kazuist/ui';
import styles from '../kaydettiklerim.module.css';

/**
 * "Kaynakçayı kopyala" (FR-23). Uses the clipboard API; when it is missing or refused the text area below is
 * selected so the user can copy by hand. The text stays in the browser.
 */
export function KopyalaKaynakca({ metin }: { metin: string }) {
  const [mesaj, setMesaj] = useState('');
  const alan = useRef<HTMLTextAreaElement>(null);

  async function kopyala() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard');
      await navigator.clipboard.writeText(metin);
      setMesaj(tr.disa.kopyalandi);
    } catch {
      alan.current?.focus();
      alan.current?.select();
      setMesaj(tr.disa.kopyalaHata);
    }
  }

  return (
    <div className={styles.kopyala}>
      <Dugme onClick={kopyala}>{tr.disa.kopyala}</Dugme>
      <p role="status" aria-live="polite" className={styles.durum}>
        {mesaj}
      </p>
      <label className="kz-alan__etiket" htmlFor="kaynakca-metni">
        {tr.disa.metinEtiketi}
      </label>
      <textarea
        id="kaynakca-metni"
        ref={alan}
        className={`kz-alan__girdi ${styles.metin}`}
        readOnly
        value={metin}
        rows={Math.min(10, Math.max(3, metin.split('\n').length))}
      />
    </div>
  );
}
