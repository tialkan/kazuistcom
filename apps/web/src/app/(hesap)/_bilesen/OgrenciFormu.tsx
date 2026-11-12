'use client';

import { useState, type FormEvent } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme, FormAlani } from '@kazuist/ui';
import styles from './hesap.module.css';
import { istek } from './istek';

const s = tr.sayfa.ogrenci;

/**
 * edu.tr verification: POST /api/v1/me/edu-verification sends a 6 digit code (204), then
 * POST /api/v1/me/edu-verification/confirm checks it. The server decides what counts as edu.tr.
 */
export function OgrenciFormu({ dogrulandi }: { dogrulandi: boolean }) {
  const [adim, setAdim] = useState<'eposta' | 'kod' | 'tamam'>('eposta');
  const [eposta, setEposta] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    if (adim === 'eposta') {
      const r = await istek('/api/v1/me/edu-verification', { govde: { email: eposta.trim() } });
      if (r.ok) setAdim('kod');
      else setError(r.mesaj ?? tr.hata.genel);
    } else {
      const r = await istek('/api/v1/me/edu-verification/confirm', {
        govde: { code: String(data.get('code') ?? '') },
      });
      if (r.ok) setAdim('tamam');
      else setError(r.mesaj ?? tr.hata.kodHatali);
    }
    setBusy(false);
  }

  if (adim === 'tamam')
    return (
      <p className={styles.durum} role="status">
        {s.tamam}
      </p>
    );

  return (
    <>
      {dogrulandi ? <p className={styles.durum}>{s.dogrulandi}</p> : null}
      <form className={`${styles.form} ${styles.dar}`} onSubmit={submit}>
        <FormAlani
          id="ogrenci-eposta"
          name="email"
          type="email"
          etiket={s.eposta}
          ipucu={s.epostaIpucu}
          autoComplete="email"
          value={eposta}
          onChange={(e) => setEposta(e.target.value)}
          readOnly={adim === 'kod'}
          required
        />
        {adim === 'kod' && (
          <>
            <p className={styles.durum} role="status">
              {s.kodGonderildi}
            </p>
            <FormAlani
              id="ogrenci-kod"
              name="code"
              etiket={s.kod}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </>
        )}
        <div role="alert">{error ? <p className={styles.hata}>{error}</p> : null}</div>
        <div className={styles.eylemler}>
          <Dugme type="submit" disabled={busy} aria-busy={busy}>
            {busy ? tr.form.bekleyin : adim === 'eposta' ? s.kodGonder : s.dogrula}
          </Dugme>
          {adim === 'kod' && (
            <Dugme
              tur="sessiz"
              onClick={() => {
                setAdim('eposta');
                setError(null);
              }}
            >
              {s.baskaAdres}
            </Dugme>
          )}
        </div>
      </form>
    </>
  );
}
