'use client';

import { useState } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme } from '@kazuist/ui';
import styles from './hesap.module.css';
import { istek } from './istek';

const o = tr.sayfa.yonetimOrtak;

export type Karar = 'onay' | 'ret' | 'duzelt';

export interface KararSecenegi {
  karar: Karar;
  etiket: string;
  /** Text shown after the server accepted this decision. */
  sonuc: string;
}

/**
 * Decision buttons of one review item (takedowns or anonymization). Posts to the admin decision endpoint, which
 * checks the staff gate again; 404 means another editor decided first, other errors show the server's text
 * (for example the 409 of a release whose re-mask has not finished).
 */
export function KuyrukKarari({
  kuyruk,
  kalemId,
  secenekler,
}: {
  kuyruk: 'takedowns' | 'anonymization';
  kalemId: string;
  secenekler: KararSecenegi[];
}) {
  const [busy, setBusy] = useState(false);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [not, setNot] = useState('');
  const notId = `karar-not-${kalemId}`;

  async function gonder(s: KararSecenegi) {
    setBusy(true);
    setError(null);
    const r = await istek(`/api/v1/admin/queues/${kuyruk}/${kalemId}/decision`, {
      govde: { decision: s.karar, ...(not.trim() ? { note: not.trim() } : {}) },
    });
    setBusy(false);
    if (r.ok) setSonuc(s.sonuc);
    else if (r.status === 404) setSonuc(o.zatenKarar);
    else setError(r.mesaj ?? o.hata);
  }

  if (sonuc)
    return (
      <p role="status" className={styles.durum}>
        {sonuc}
      </p>
    );
  return (
    <>
      <label className={styles.etiket} htmlFor={notId}>
        {o.not}
      </label>
      <textarea
        id={notId}
        className={styles.select}
        rows={2}
        maxLength={2000}
        value={not}
        onChange={(e) => setNot(e.currentTarget.value)}
      />
      <div role="alert">{error ? <p className={styles.hata}>{error}</p> : null}</div>
      <div className={styles.eylemler}>
        {secenekler.map((s, i) => (
          <Dugme
            key={s.karar}
            tur={i === 0 ? 'birincil' : 'ikincil'}
            disabled={busy}
            aria-busy={busy}
            onClick={() => void gonder(s)}
          >
            {s.etiket}
          </Dugme>
        ))}
      </div>
    </>
  );
}
