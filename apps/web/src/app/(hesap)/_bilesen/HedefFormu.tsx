'use client';

import { useState, type FormEvent } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme } from '@kazuist/ui';
import styles from './hesap.module.css';
import { istek } from './istek';

const s = tr.sayfa.hedef;

export interface MeslekSecenegi {
  id: string;
  label: string;
  avatars: string[];
}

const avatarEtiketi = (avatar: string) => {
  const ek = avatar.slice(avatar.lastIndexOf('-') + 1) as keyof typeof s.avatarlar;
  return s.avatarlar[ek] ?? avatar;
};

/** Target profession and look; PUT /api/v1/me/target-profession validates both on the server. */
export function HedefFormu({
  meslekler,
  secili,
  seciliAvatar,
}: {
  meslekler: MeslekSecenegi[];
  secili: string | null;
  seciliAvatar: string | null;
}) {
  const [meslek, setMeslek] = useState(secili ?? '');
  const [avatar, setAvatar] = useState(seciliAvatar ?? '');
  const [busy, setBusy] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const avatarlar = meslekler.find((m) => m.id === meslek)?.avatars ?? [];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!meslek) return;
    setBusy(true);
    setDurum(null);
    setError(null);
    const r = await istek('/api/v1/me/target-profession', {
      method: 'PUT',
      govde: { professionId: meslek, ...(avatarlar.includes(avatar) ? { avatar } : {}) },
    });
    setBusy(false);
    if (r.ok) setDurum(s.kaydedildi);
    else setError(r.mesaj ?? s.hata);
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <fieldset className={styles.grup}>
        <legend>{s.meslek}</legend>
        <div className={`${styles.secenekler} ${styles['secenekler--iki']}`}>
          {meslekler.map((m) => (
            <label key={m.id} className={styles.secim}>
              <input
                type="radio"
                name="meslek"
                value={m.id}
                checked={meslek === m.id}
                onChange={() => {
                  setMeslek(m.id);
                  setAvatar('');
                }}
                required
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {avatarlar.length ? (
        <fieldset className={styles.grup}>
          <legend>{s.avatar}</legend>
          <div className={styles.secenekler}>
            {avatarlar.map((a) => (
              <label key={a} className={styles.secim}>
                <input
                  type="radio"
                  name="avatar"
                  value={a}
                  checked={avatar === a}
                  onChange={() => setAvatar(a)}
                />
                <span>{avatarEtiketi(a)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div role="status">{durum ? <p className={styles.durum}>{durum}</p> : null}</div>
      <div role="alert">{error ? <p className={styles.hata}>{error}</p> : null}</div>
      <div className={styles.eylemler}>
        <Dugme type="submit" disabled={busy || !meslek} aria-busy={busy}>
          {busy ? tr.form.bekleyin : s.kaydet}
        </Dugme>
      </div>
    </form>
  );
}
