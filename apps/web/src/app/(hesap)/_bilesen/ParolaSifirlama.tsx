'use client';

import { useState, type FormEvent } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme, FormAlani } from '@kazuist/ui';
import styles from './hesap.module.css';
import { istek } from './istek';

const s = tr.sayfa.parola;

/**
 * Password reset with an e-mail code (Better Auth email-otp): request the code, then send the code with
 * the new password. The request answers the same whether or not the address has an account. A successful
 * reset ends every session of the account (auth.ts revokeSessionsOnPasswordReset).
 */
export function ParolaSifirlama() {
  const [adim, setAdim] = useState<'eposta' | 'kod' | 'tamam'>('eposta');
  const [eposta, setEposta] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      if (adim === 'eposta') {
        const r = await istek('/api/auth/email-otp/request-password-reset', { govde: { email: eposta } });
        if (r.ok) setAdim('kod');
        else setError(r.mesaj ?? tr.hata.genel);
      } else {
        const r = await istek('/api/auth/email-otp/reset-password', {
          govde: {
            email: eposta,
            otp: String(data.get('otp') ?? ''),
            password: String(data.get('password') ?? ''),
          },
        });
        if (r.ok) setAdim('tamam');
        else setError(r.mesaj ?? s.hata);
      }
    } finally {
      setBusy(false);
    }
  }

  if (adim === 'tamam')
    return (
      <div className={styles.dar}>
        <p className={styles.durum} role="status">
          {s.tamam}
        </p>
        <Dugme href="/giris">{s.girisBaglanti}</Dugme>
      </div>
    );

  return (
    <form className={`${styles.form} ${styles.dar}`} onSubmit={submit}>
      <FormAlani
        id="parola-eposta"
        name="email"
        type="email"
        etiket={tr.form.eposta}
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
            id="parola-kod"
            name="otp"
            etiket={s.kod}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
          <FormAlani
            id="parola-yeni"
            name="password"
            type="password"
            etiket={s.yeniParola}
            ipucu={tr.form.parolaIpucu}
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            required
          />
        </>
      )}
      <div role="alert">{error ? <p className={styles.hata}>{error}</p> : null}</div>
      <div className={styles.eylemler}>
        <Dugme type="submit" disabled={busy} aria-busy={busy}>
          {busy ? tr.form.bekleyin : adim === 'eposta' ? s.kodIste : s.kaydet}
        </Dugme>
        <a href="/giris">{s.girisBaglanti}</a>
      </div>
    </form>
  );
}
