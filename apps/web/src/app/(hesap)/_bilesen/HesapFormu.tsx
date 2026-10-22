'use client';

import { useState, type FormEvent } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

const f = tr.form;

/**
 * E-mail and password form for /kayit and /giris. Posts to Better Auth on our own origin (the browser
 * sends Origin; the session cookie is HttpOnly and set by the server). E-mail code and passkey buttons
 * come with the on-yuz components.
 */
export function HesapFormu({ kind }: { kind: 'kayit' | 'giris' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    const body =
      kind === 'kayit'
        ? { email, password, name: String(data.get('name') ?? '') || email.split('@')[0] }
        : { email, password };
    try {
      const res = await fetch(kind === 'kayit' ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        window.location.assign('/hesap');
        return;
      }
      setError(kind === 'kayit' ? f.kayitHata : f.girisHata);
    } catch {
      setError(tr.hata.genel);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate={false} aria-describedby={error ? 'hesap-hata' : undefined}>
      {kind === 'kayit' && (
        <p>
          <label htmlFor="hesap-ad">{f.ad}</label>
          <input id="hesap-ad" name="name" type="text" autoComplete="name" maxLength={120} />
        </p>
      )}
      <p>
        <label htmlFor="hesap-eposta">{f.eposta}</label>
        <input id="hesap-eposta" name="email" type="email" autoComplete="email" required />
      </p>
      <p>
        <label htmlFor="hesap-parola">{f.parola}</label>
        <input
          id="hesap-parola"
          name="password"
          type="password"
          autoComplete={kind === 'kayit' ? 'new-password' : 'current-password'}
          minLength={10}
          maxLength={128}
          required
          aria-describedby={kind === 'kayit' ? 'hesap-parola-ipucu' : undefined}
        />
        {kind === 'kayit' && <span id="hesap-parola-ipucu">{f.parolaIpucu}</span>}
      </p>
      {error && (
        <p id="hesap-hata" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} aria-busy={busy}>
        {busy ? f.bekleyin : kind === 'kayit' ? f.kayitDugme : f.girisDugme}
      </button>
      <p>
        <a href={kind === 'kayit' ? '/giris' : '/kayit'}>
          {kind === 'kayit' ? f.girisBaglanti : f.kayitBaglanti}
        </a>
      </p>
    </form>
  );
}
