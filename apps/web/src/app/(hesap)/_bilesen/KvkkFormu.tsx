'use client';

import { useState, type FormEvent } from 'react';
import { kvkkRequestKinds, type KvkkReplyChannel } from '@kazuist/contracts';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme, FormAlani } from '@kazuist/ui';
import styles from './hesap.module.css';
import { doldur, istek, tarihTr } from './istek';

const s = tr.sayfa.kvkk;

interface Makbuz {
  id: string;
  dueAt: string;
}

/**
 * KVKK m.11 application of a signed in user: POST /api/v1/kvkk-requests. Identity comes from the session;
 * the receipt shows the application number and the 30 day deadline computed by the server.
 */
export function KvkkFormu() {
  const [kanal, setKanal] = useState<KvkkReplyChannel>('eposta');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [makbuz, setMakbuz] = useState<Makbuz | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const detail = String(data.get('detail') ?? '').trim();
    const address = String(data.get('address') ?? '').trim();
    if (!detail) return setError(s.detayGerekli);
    if (kanal === 'posta' && !address) return setError(s.adresGerekli);
    setBusy(true);
    const r = await istek<Makbuz>('/api/v1/kvkk-requests', {
      govde: {
        kind: String(data.get('kind') ?? ''),
        detail,
        replyChannel: kanal,
        ...(kanal === 'posta' ? { address } : {}),
      },
    });
    setBusy(false);
    if (r.ok && r.veri) setMakbuz(r.veri);
    else setError(r.mesaj ?? s.hata);
  }

  if (makbuz)
    return (
      <p className={styles.durum} role="status">
        {doldur(s.alindi, { id: makbuz.id, tarih: tarihTr(makbuz.dueAt) })}
      </p>
    );

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className="kz-alan">
        <label className="kz-alan__etiket" htmlFor="kvkk-tur">
          {s.tur}
        </label>
        <select id="kvkk-tur" name="kind" className={styles.select} required defaultValue="bilgi">
          {kvkkRequestKinds.map((k) => (
            <option key={k} value={k}>
              {s.turler[k]}
            </option>
          ))}
        </select>
      </div>
      <FormAlani
        id="kvkk-detay"
        name="detail"
        cokSatir
        etiket={s.detay}
        ipucu={s.detayIpucu}
        maxLength={4000}
        rows={6}
        required
      />
      <fieldset className={styles.grup}>
        <legend>{s.kanal}</legend>
        <div className={styles.secenekler}>
          {(['eposta', 'posta'] as const).map((k) => (
            <label key={k} className={styles.secim}>
              <input
                type="radio"
                name="replyChannel"
                value={k}
                checked={kanal === k}
                onChange={() => setKanal(k)}
              />
              <span>{s.kanallar[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {kanal === 'posta' && (
        <FormAlani
          id="kvkk-adres"
          name="address"
          cokSatir
          etiket={s.adres}
          autoComplete="street-address"
          maxLength={500}
          rows={3}
          required
        />
      )}
      <div role="alert">{error ? <p className={styles.hata}>{error}</p> : null}</div>
      <div className={styles.eylemler}>
        <Dugme type="submit" disabled={busy} aria-busy={busy}>
          {busy ? tr.form.bekleyin : s.gonder}
        </Dugme>
      </div>
    </form>
  );
}
