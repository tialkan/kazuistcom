'use client';

import { useState, type FormEvent } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme } from '@kazuist/ui';
import styles from './hesap.module.css';
import { istek } from './istek';

const s = tr.sayfa.bildirimler;

type Kanal = 'email' | 'webPush' | 'apns';
type Tur = keyof typeof s.turler;
type Harita = Partial<Record<string, boolean>>;
export type Tercihler = Record<Kanal, Harita>;

const kanallar: Kanal[] = ['email', 'webPush', 'apns'];
/** Types produced today (Kalemcik and billing); Kampus types are passive (ADR-0031). */
const turler = Object.keys(s.turler) as Tur[];
/** Same list as server/auth/notifications.ts mandatoryEmailTypes; the server drops them from the e-mail map. */
const zorunluEposta: readonly string[] = ['odeme', 'fesih_teyidi'];

const zorunlu = (k: Kanal, t: string) => k === 'email' && zorunluEposta.includes(t);
/** A missing type means its default: informational types are on (commercial is handled below). */
const acikMi = (h: Tercihler, k: Kanal, t: string) => zorunlu(k, t) || (h[k][t] ?? true);

/**
 * Per type and channel checkboxes. Saving PUTs all three channel maps; keys this form does not show (kampanya,
 * passive types) are carried over unchanged. The commercial consent is a separate form: it writes a versioned
 * consents row first and then the e-mail kampanya preference, so neither is set without the other.
 */
export function BildirimTercihleri({
  tercihler,
  ticari,
}: {
  tercihler: Tercihler;
  ticari: { version: string; granted: boolean };
}) {
  const [harita, setHarita] = useState<Tercihler>(tercihler);
  /** Last saved state; the consent form writes on top of it, not on unsaved checkbox edits. */
  const [kayitli, setKayitli] = useState<Tercihler>(tercihler);
  const [busy, setBusy] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [onay, setOnay] = useState(ticari.granted);
  const [kayitliOnay, setKayitliOnay] = useState(ticari.granted);
  const [tBusy, setTBusy] = useState(false);
  const [tDurum, setTDurum] = useState<string | null>(null);
  const [tError, setTError] = useState<string | null>(null);

  function degistir(k: Kanal, t: string, v: boolean) {
    setHarita((h) => ({ ...h, [k]: { ...h[k], [t]: v } }));
  }

  async function kaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setDurum(null);
    setError(null);
    const govde = Object.fromEntries(
      kanallar.map((k) => [k, Object.fromEntries(Object.entries(harita[k]).filter(([t]) => !zorunlu(k, t)))]),
    );
    const r = await istek<Tercihler>('/api/v1/notifications/preferences', { method: 'PUT', govde });
    setBusy(false);
    if (r.ok && r.veri) {
      setHarita(r.veri);
      setKayitli(r.veri);
      setDurum(s.kaydedildi);
    } else setError(r.mesaj ?? s.hata);
  }

  async function ticariKaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTBusy(true);
    setTDurum(null);
    setTError(null);
    const riza = await istek('/api/v1/me/consents', {
      govde: { kind: 'acik_riza_pazarlama', version: ticari.version, granted: onay },
    });
    if (!riza.ok) {
      setTBusy(false);
      setTError(riza.mesaj ?? s.ticari.hata);
      return;
    }
    const r = await istek<Tercihler>('/api/v1/notifications/preferences', {
      method: 'PUT',
      govde: { email: { ...kayitli.email, kampanya: onay } },
    });
    setTBusy(false);
    if (r.ok && r.veri) {
      setKayitli(r.veri);
      setHarita((h) => ({ ...h, email: { ...h.email, kampanya: onay } }));
      setKayitliOnay(onay);
      setTDurum(s.ticari.kaydedildi);
    } else setTError(r.mesaj ?? s.ticari.hata);
  }

  return (
    <>
      <form className={styles.form} onSubmit={kaydet} aria-describedby="bildirim-sessiz">
        <p id="bildirim-sessiz" className={styles.soluk}>
          {s.sessizSaat}
        </p>
        {turler.map((t) => (
          <fieldset key={t} className={styles.grup}>
            <legend>{s.turler[t].baslik}</legend>
            <p className={styles.soluk}>{s.turler[t].aciklama}</p>
            <div className={styles.kanallar}>
              {kanallar.map((k) => (
                <label key={k} className={styles.secim}>
                  <input
                    type="checkbox"
                    name={`${t}.${k}`}
                    checked={acikMi(harita, k, t)}
                    disabled={zorunlu(k, t)}
                    aria-describedby={zorunlu(k, t) ? 'bildirim-zorunlu' : undefined}
                    onChange={(ev) => degistir(k, t, ev.currentTarget.checked)}
                  />
                  <span>{s.kanallar[k]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <p id="bildirim-zorunlu" className={styles.soluk}>
          {s.zorunlu}
        </p>
        <div role="status">{durum ? <p className={styles.durum}>{durum}</p> : null}</div>
        <div role="alert">{error ? <p className={styles.hata}>{error}</p> : null}</div>
        <div className={styles.eylemler}>
          <Dugme type="submit" disabled={busy} aria-busy={busy}>
            {busy ? tr.form.bekleyin : s.kaydet}
          </Dugme>
        </div>
      </form>

      <section className={styles.kutu} aria-labelledby="bildirim-ticari">
        <h2 id="bildirim-ticari">{s.ticari.baslik}</h2>
        <p>{s.ticari.aciklama}</p>
        <p className={styles.soluk}>{kayitliOnay ? s.ticari.acik : s.ticari.kapali}</p>
        <form onSubmit={ticariKaydet}>
          <label className={styles.secim}>
            <input
              type="checkbox"
              name="acik_riza_pazarlama"
              checked={onay}
              onChange={(ev) => setOnay(ev.currentTarget.checked)}
            />
            <span>{s.ticari.onay}</span>
          </label>
          <p>
            <a href="/hukuki/acik-riza" target="_blank" rel="noopener">
              {s.ticari.metin}
            </a>
          </p>
          <div role="status">{tDurum ? <p className={styles.durum}>{tDurum}</p> : null}</div>
          <div role="alert">{tError ? <p className={styles.hata}>{tError}</p> : null}</div>
          <div className={styles.eylemler}>
            <Dugme type="submit" tur="ikincil" disabled={tBusy || onay === kayitliOnay} aria-busy={tBusy}>
              {tBusy ? tr.form.bekleyin : s.ticari.kaydet}
            </Dugme>
          </div>
        </form>
      </section>
    </>
  );
}
