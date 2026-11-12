'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme, FormAlani } from '@kazuist/ui';
import styles from './hesap.module.css';
import { doldur, istek, tarihTr } from './istek';
import { passkeyDestekleniyor, passkeyEkle } from './passkey';

const g = tr.sayfa.guvenlik;

export interface PasskeySatiri {
  id: string;
  name: string | null;
  createdAt: string;
}

/** Passkeys of the account: list (rendered by the server), add with WebAuthn, remove. */
export function PasskeyYonetimi({ passkeys }: { passkeys: PasskeySatiri[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ekle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDurum(null);
    setError(null);
    if (!passkeyDestekleniyor()) return setError(g.passkey.desteklenmiyor);
    const ad = String(new FormData(e.currentTarget).get('ad') ?? '').trim();
    setBusy(true);
    const ok = await passkeyEkle(ad || undefined).catch(() => false);
    setBusy(false);
    if (!ok) return setError(g.passkey.hata);
    setDurum(g.passkey.eklendi);
    router.refresh();
  }

  async function sil(id: string) {
    setDurum(null);
    setError(null);
    setBusy(true);
    const r = await istek('/api/auth/passkey/delete-passkey', { govde: { id } });
    setBusy(false);
    if (!r.ok) return setError(g.passkey.hata);
    setDurum(g.passkey.silindi);
    router.refresh();
  }

  return (
    <section className={styles.kutu} aria-labelledby="guvenlik-passkey">
      <h2 id="guvenlik-passkey">{g.passkey.baslik}</h2>
      <p>{g.passkey.aciklama}</p>
      {passkeys.length ? (
        <ul className={styles.liste}>
          {passkeys.map((p) => {
            const ad = p.name || g.passkey.adsiz;
            return (
              <li key={p.id}>
                <span>
                  {ad}{' '}
                  <span className={styles.soluk}>
                    {doldur(g.passkey.eklenme, { tarih: tarihTr(p.createdAt) })}
                  </span>
                </span>
                <Dugme
                  tur="sessiz"
                  disabled={busy}
                  aria-label={doldur(g.passkey.silEtiket, { ad })}
                  onClick={() => void sil(p.id)}
                >
                  {g.passkey.sil}
                </Dugme>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.soluk}>{g.passkey.yok}</p>
      )}
      <form className={`${styles.form} ${styles.dar}`} onSubmit={ekle}>
        <FormAlani id="passkey-ad" name="ad" type="text" etiket={g.passkey.ad} maxLength={60} />
        <div role="status">{durum ? <p className={styles.durum}>{durum}</p> : null}</div>
        <div role="alert">{error ? <p className={styles.hata}>{error}</p> : null}</div>
        <div className={styles.eylemler}>
          <Dugme type="submit" disabled={busy} aria-busy={busy}>
            {g.passkey.ekle}
          </Dugme>
        </div>
      </form>
    </section>
  );
}

const anahtarOf = (uri: string) => {
  try {
    return new URL(uri).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
};

/**
 * TOTP enrolment (Better Auth two-factor): /two-factor/enable returns the otpauth URI and backup codes,
 * /two-factor/verify-totp with the first code turns it on. Password accounts confirm with the password.
 */
export function IkiAdimKurulumu({ acik, parolaGerekli }: { acik: boolean; parolaGerekli: boolean }) {
  const router = useRouter();
  const [kurulum, setKurulum] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [tamam, setTamam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function baslat(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    const r = await istek<{ totpURI?: string; backupCodes?: string[] }>('/api/auth/two-factor/enable', {
      govde: parolaGerekli ? { password } : {},
    });
    setBusy(false);
    if (r.ok && r.veri?.totpURI)
      setKurulum({ totpURI: r.veri.totpURI, backupCodes: r.veri.backupCodes ?? [] });
    else setError(r.mesaj ?? g.totp.baslatHata);
  }

  async function dogrula(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const code = String(new FormData(e.currentTarget).get('code') ?? '');
    const r = await istek('/api/auth/two-factor/verify-totp', { govde: { code } });
    setBusy(false);
    if (!r.ok) return setError(r.mesaj ?? g.totp.hata);
    setTamam(true);
    router.refresh();
  }

  const hata = <div role="alert">{error ? <p className={styles.hata}>{error}</p> : null}</div>;

  return (
    <section className={styles.kutu} aria-labelledby="guvenlik-totp">
      <h2 id="guvenlik-totp">{g.totp.baslik}</h2>
      <p>{g.totp.aciklama}</p>
      {acik || tamam ? (
        <p className={styles.durum} role="status">
          {tamam ? g.totp.tamam : g.totp.acik}
        </p>
      ) : kurulum ? (
        <>
          <h3>{g.totp.anahtar}</h3>
          <p>{g.totp.anahtarAciklama}</p>
          <p className={`kz-mono ${styles.anahtar}`}>{anahtarOf(kurulum.totpURI)}</p>
          <p>
            <a href={kurulum.totpURI}>{g.totp.baglanti}</a>
          </p>
          {kurulum.backupCodes.length ? (
            <>
              <h3>{g.totp.yedek}</h3>
              <p>{g.totp.yedekAciklama}</p>
              <ul className={`${styles.kodlar} kz-mono`}>
                {kurulum.backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
          <form className={`${styles.form} ${styles.dar}`} onSubmit={dogrula}>
            <FormAlani
              id="totp-kod"
              name="code"
              etiket={g.totp.kod}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
            {hata}
            <div className={styles.eylemler}>
              <Dugme type="submit" disabled={busy} aria-busy={busy}>
                {busy ? tr.form.bekleyin : g.totp.dogrula}
              </Dugme>
            </div>
          </form>
        </>
      ) : (
        <form className={`${styles.form} ${styles.dar}`} onSubmit={baslat}>
          <p className={styles.soluk}>{g.totp.kapali}</p>
          {parolaGerekli ? (
            <FormAlani
              id="totp-parola"
              name="password"
              type="password"
              etiket={g.totp.parola}
              autoComplete="current-password"
              maxLength={128}
              required
            />
          ) : null}
          {hata}
          <div className={styles.eylemler}>
            <Dugme type="submit" disabled={busy} aria-busy={busy}>
              {busy ? tr.form.bekleyin : g.totp.baslat}
            </Dugme>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * Admin step up for editor and yonetici (plan 5.6/2): a passkey session plus a TOTP code confirmed for
 * this session through POST /api/auth/step-up/confirm; valid one hour (server/auth/step-up.ts).
 */
export function YoneticiOnayi({
  passkeySession,
  totpEnabled,
  secondStep,
}: {
  passkeySession: boolean;
  totpEnabled: boolean;
  secondStep: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tamam, setTamam] = useState(false);

  async function onayla(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const code = String(new FormData(e.currentTarget).get('code') ?? '');
    const r = await istek('/api/auth/step-up/confirm', { govde: { code } });
    setBusy(false);
    if (!r.ok) return setError(r.mesaj ?? g.yonetici.hata);
    setTamam(true);
    router.refresh();
  }

  let icerik;
  if (secondStep || tamam)
    icerik = (
      <p className={styles.durum} role="status">
        {tamam ? g.yonetici.tamam : g.yonetici.onayli}
      </p>
    );
  else if (!passkeySession) icerik = <p className={styles.hata}>{g.yonetici.passkeyGerekli}</p>;
  else if (!totpEnabled) icerik = <p className={styles.hata}>{g.yonetici.totpGerekli}</p>;
  else
    icerik = (
      <form className={`${styles.form} ${styles.dar}`} onSubmit={onayla}>
        <FormAlani
          id="yonetici-kod"
          name="code"
          etiket={g.yonetici.kod}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
        <div role="alert">{error ? <p className={styles.hata}>{error}</p> : null}</div>
        <div className={styles.eylemler}>
          <Dugme type="submit" disabled={busy} aria-busy={busy}>
            {busy ? tr.form.bekleyin : g.yonetici.onayla}
          </Dugme>
        </div>
      </form>
    );

  return (
    <section className={styles.kutu} aria-labelledby="guvenlik-yonetici">
      <h2 id="guvenlik-yonetici">{g.yonetici.baslik}</h2>
      <p>{g.yonetici.aciklama}</p>
      {icerik}
    </section>
  );
}
