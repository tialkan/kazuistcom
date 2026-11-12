'use client';

import { useState, type FormEvent } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme, FormAlani } from '@kazuist/ui';
import styles from './hesap.module.css';
import { istek } from './istek';
import { passkeyDestekleniyor, passkeyIleGiris } from './passkey';
import { RizaEtiketi } from './RizaEtiketi';

const f = tr.form;

/** Version of each text accepted on /kayit (content/hukuki front matter, read by the server page). */
export interface KayitRizalari {
  kullanim_kosullari: string;
  aydinlatma: string;
}

type Kip = 'parola' | 'kod' | 'totp';

/**
 * Sign up and sign in for /kayit and /giris. Calls Better Auth on our own origin; the session cookie is
 * HttpOnly and set by the server. Sign in offers password, a one time e-mail code and a passkey; a
 * password sign in of an account with TOTP continues with the second step. Sign up requires the terms box
 * and then records both consents through POST /api/v1/me/consents.
 */
export function HesapFormu(
  props: { kind: 'giris'; sonra: string } | { kind: 'kayit'; sonra: string; rizalar: KayitRizalari },
) {
  const { kind, sonra } = props;
  const [kip, setKip] = useState<Kip>('parola');
  const [eposta, setEposta] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [rizaHata, setRizaHata] = useState(false);

  const git = () => window.location.assign(sonra);

  async function kayit(data: FormData) {
    if (props.kind !== 'kayit') return;
    if (data.get('riza') !== 'on') {
      setError(f.rizaGerekli);
      return;
    }
    const email = String(data.get('email') ?? '');
    const r = await istek('/api/auth/sign-up/email', {
      govde: {
        email,
        password: String(data.get('password') ?? ''),
        name: String(data.get('name') ?? '').trim() || email.split('@')[0],
      },
    });
    if (!r.ok) {
      setError(r.mesaj ?? f.kayitHata);
      return;
    }
    const kayitlar = await Promise.all(
      (Object.entries(props.rizalar) as [keyof KayitRizalari, string][]).map(([kindKey, version]) =>
        istek('/api/v1/me/consents', { govde: { kind: kindKey, version, granted: true } }),
      ),
    );
    if (kayitlar.every((k) => k.ok)) git();
    else setRizaHata(true);
  }

  async function parolaIleGiris(data: FormData) {
    const r = await istek<{ twoFactorRedirect?: boolean }>('/api/auth/sign-in/email', {
      govde: { email: String(data.get('email') ?? ''), password: String(data.get('password') ?? '') },
    });
    if (!r.ok) {
      setError(r.mesaj ?? f.girisHata);
      return;
    }
    if (r.veri?.twoFactorRedirect) {
      setKip('totp');
      return;
    }
    git();
  }

  async function kodIste() {
    setError(null);
    setBilgi(null);
    const input = document.getElementById('hesap-eposta') as HTMLInputElement | null;
    if (!input?.reportValidity()) return;
    setBusy(true);
    const r = await istek('/api/auth/email-otp/send-verification-otp', {
      govde: { email: eposta, type: 'sign-in' },
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.mesaj ?? tr.hata.genel);
      return;
    }
    setKip('kod');
    setBilgi(f.kodGonderildi);
  }

  async function kodIleGiris(data: FormData) {
    const r = await istek('/api/auth/sign-in/email-otp', {
      govde: { email: eposta, otp: String(data.get('otp') ?? '') },
    });
    if (r.ok) git();
    else setError(r.mesaj ?? f.kodHata);
  }

  async function ikinciAdim(data: FormData) {
    const r = await istek('/api/auth/two-factor/verify-totp', {
      govde: { code: String(data.get('totp') ?? '') },
    });
    if (r.ok) git();
    else setError(r.mesaj ?? f.totpHata);
  }

  async function passkey() {
    setError(null);
    if (!passkeyDestekleniyor()) {
      setError(tr.sayfa.guvenlik.passkey.desteklenmiyor);
      return;
    }
    setBusy(true);
    const ok = await passkeyIleGiris().catch(() => false);
    setBusy(false);
    if (ok) git();
    else setError(f.passkeyHata);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      if (kind === 'kayit') await kayit(data);
      else if (kip === 'kod') await kodIleGiris(data);
      else if (kip === 'totp') await ikinciAdim(data);
      else await parolaIleGiris(data);
    } finally {
      setBusy(false);
    }
  }

  if (rizaHata)
    return (
      <div className={styles.dar}>
        <p className={styles.hata} role="alert">
          {f.rizaKayitHata}
        </p>
        <Dugme href="/hesap">{tr.sayfa.hesap.baslik}</Dugme>
      </div>
    );

  // The alert region exists from the first render so a new error is announced.
  const hataKutusu = (
    <div role="alert">
      {error ? (
        <p id="hesap-hata" className={styles.hata}>
          {error}
        </p>
      ) : null}
    </div>
  );

  if (kip === 'totp')
    return (
      <form className={`${styles.form} ${styles.dar}`} onSubmit={submit}>
        <h2>{f.ikinciAdimBaslik}</h2>
        <p>{f.ikinciAdimAciklama}</p>
        <FormAlani
          id="hesap-totp"
          name="totp"
          etiket={f.totpKod}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
        {hataKutusu}
        <div className={styles.eylemler}>
          <Dugme type="submit" disabled={busy} aria-busy={busy}>
            {busy ? f.bekleyin : f.totpDugme}
          </Dugme>
        </div>
      </form>
    );

  return (
    <div className={styles.dar}>
      <form className={styles.form} onSubmit={submit} aria-describedby={error ? 'hesap-hata' : undefined}>
        {kind === 'kayit' && (
          <FormAlani
            id="hesap-ad"
            name="name"
            type="text"
            etiket={f.ad}
            autoComplete="name"
            maxLength={120}
          />
        )}
        <FormAlani
          id="hesap-eposta"
          name="email"
          type="email"
          etiket={f.eposta}
          autoComplete="email"
          value={eposta}
          onChange={(e) => setEposta(e.target.value)}
          required
        />
        {kip === 'kod' ? (
          <FormAlani
            id="hesap-kod"
            name="otp"
            etiket={f.kod}
            ipucu={f.kodIpucu}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        ) : (
          <FormAlani
            id="hesap-parola"
            name="password"
            type="password"
            etiket={f.parola}
            ipucu={kind === 'kayit' ? f.parolaIpucu : undefined}
            autoComplete={kind === 'kayit' ? 'new-password' : 'current-password'}
            minLength={kind === 'kayit' ? 10 : undefined}
            maxLength={128}
            required
          />
        )}
        {kind === 'kayit' && (
          <label className={styles.secim}>
            <input type="checkbox" name="riza" required />
            <RizaEtiketi />
          </label>
        )}
        {bilgi ? (
          <p className={styles.durum} role="status">
            {bilgi}
          </p>
        ) : null}
        {hataKutusu}
        <div className={styles.eylemler}>
          <Dugme type="submit" disabled={busy} aria-busy={busy}>
            {busy ? f.bekleyin : kind === 'kayit' ? f.kayitDugme : kip === 'kod' ? f.kodDugme : f.girisDugme}
          </Dugme>
          {kind === 'giris' && kip === 'parola' && <a href="/parola-sifirla">{f.parolaUnuttum}</a>}
        </div>
      </form>
      {kind === 'giris' && (
        <section aria-labelledby="hesap-diger">
          <h2 id="hesap-diger">{f.digerYollar}</h2>
          <div className={styles.eylemler}>
            {kip === 'kod' ? (
              <Dugme
                tur="ikincil"
                onClick={() => {
                  setKip('parola');
                  setBilgi(null);
                  setError(null);
                }}
              >
                {f.parolaylaDevam}
              </Dugme>
            ) : (
              <Dugme tur="ikincil" disabled={busy} onClick={() => void kodIste()}>
                {f.kodlaDevam}
              </Dugme>
            )}
            <Dugme tur="ikincil" disabled={busy} onClick={() => void passkey()}>
              {f.passkeyDugme}
            </Dugme>
          </div>
        </section>
      )}
      <p className={styles['alt-bag']}>
        <a href={kind === 'kayit' ? '/giris' : '/kayit'}>
          {kind === 'kayit' ? f.girisBaglanti : f.kayitBaglanti}
        </a>
      </p>
    </div>
  );
}
