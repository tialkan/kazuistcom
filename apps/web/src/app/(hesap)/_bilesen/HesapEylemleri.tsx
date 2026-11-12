'use client';

import { useState, type FormEvent } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme, FormAlani } from '@kazuist/ui';
import styles from './hesap.module.css';
import { istek } from './istek';
import { RizaEtiketi } from './RizaEtiketi';

const h = tr.sayfa.hesap;

/** POST /api/auth/sign-out ends this session on the server and clears the cookie, then goes home. */
export function CikisDugmesi() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function cik() {
    setBusy(true);
    setError(false);
    const r = await istek('/api/auth/sign-out', { govde: {} });
    if (r.ok) {
      window.location.assign('/');
      return;
    }
    setBusy(false);
    setError(true);
  }
  return (
    <div>
      <Dugme tur="ikincil" disabled={busy} aria-busy={busy} onClick={() => void cik()}>
        {busy ? h.cikiliyor : h.cikis}
      </Dugme>
      <div role="alert">{error ? <p className={styles.hata}>{h.cikisHata}</p> : null}</div>
    </div>
  );
}

/** Display name through PATCH /api/v1/me. */
export function ProfilFormu({ ad }: { ad: string }) {
  const [busy, setBusy] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setDurum(null);
    setError(null);
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    const r = await istek('/api/v1/me', { method: 'PATCH', govde: { name } });
    setBusy(false);
    if (r.ok) setDurum(h.adKaydedildi);
    else setError(r.mesaj ?? tr.hata.genel);
  }
  return (
    <form className={`${styles.form} ${styles.dar}`} onSubmit={submit}>
      <FormAlani
        id="profil-ad"
        name="name"
        type="text"
        etiket={h.ad}
        autoComplete="name"
        maxLength={120}
        defaultValue={ad}
        required
      />
      <div role="status">{durum ? <p className={styles.durum}>{durum}</p> : null}</div>
      <div role="alert">{error ? <p className={styles.hata}>{error}</p> : null}</div>
      <div className={styles.eylemler}>
        <Dugme type="submit" tur="ikincil" disabled={busy} aria-busy={busy}>
          {busy ? tr.form.bekleyin : h.adKaydet}
        </Dugme>
      </div>
    </form>
  );
}

/**
 * Reminder for accounts without a record of the current terms and privacy notice (accounts opened by
 * e-mail code, Google, Apple or iOS, or after a new version). Each text is a new consents row.
 */
export function RizaKutusu({ eksik }: { eksik: { kind: string; version: string }[] }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [isaret, setIsaret] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isaret) return;
    setState('busy');
    const sonuc = await Promise.all(
      eksik.map((c) =>
        istek('/api/v1/me/consents', { govde: { kind: c.kind, version: c.version, granted: true } }),
      ),
    );
    setState(sonuc.every((r) => r.ok) ? 'done' : 'error');
  }
  if (state === 'done')
    return (
      <p className={styles.durum} role="status">
        {tr.sayfa.riza.tamam}
      </p>
    );
  return (
    <section className={`${styles.kutu} ${styles['kutu--uyari']}`} aria-labelledby="riza-baslik">
      <h2 id="riza-baslik">{tr.sayfa.riza.baslik}</h2>
      <p>{tr.sayfa.riza.aciklama}</p>
      <form onSubmit={submit}>
        <label className={styles.secim}>
          <input
            type="checkbox"
            name="riza"
            required
            checked={isaret}
            onChange={(e) => setIsaret(e.target.checked)}
          />
          <RizaEtiketi />
        </label>
        <div role="alert">
          {state === 'error' ? <p className={styles.hata}>{tr.sayfa.riza.hata}</p> : null}
        </div>
        <Dugme type="submit" disabled={state === 'busy'} aria-busy={state === 'busy'}>
          {state === 'busy' ? tr.form.bekleyin : tr.sayfa.riza.dugme}
        </Dugme>
      </form>
    </section>
  );
}
