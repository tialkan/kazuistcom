'use client';

import { useState } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme } from '@kazuist/ui';
import type { CitationQueueItem } from '@/server/auth/citation-queue';
import styles from './hesap.module.css';
import { istek } from './istek';

const s = tr.sayfa.atifKuyrugu;

const yuzde = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 0 });
const birlestir = (parcalar: (string | null | undefined)[]) => parcalar.filter(Boolean).join(' ');

function adayMetni(p: CitationQueueItem['payload']): string {
  if (p.kind === 'karar') {
    const c = p.candidate;
    return (
      birlestir([
        c.court,
        c.chamber,
        c.esas ? `E. ${c.esas}` : c.number ? `E. ${c.number}` : null,
        c.karar ? `K. ${c.karar}` : null,
        c.date,
      ]) ||
      c.toRaw ||
      ''
    );
  }
  const w = p.candidate.work;
  const ana = [(w.authors ?? []).join('; '), w.title].filter(Boolean).join(', ');
  return w.venue ? `${ana} (${w.venue})` : ana;
}

function kaynakMetni(k: NonNullable<CitationQueueItem['source']>): string {
  const no = [k.esasNo ? `E. ${k.esasNo}` : null, k.kararNo ? `K. ${k.kararNo}` : null].filter(Boolean);
  return no.length ? `${k.title} (${no.join(', ')})` : k.title;
}

type Sonuc = 'onaylandi' | 'reddedildi' | 'zatenKarar';

function Aday({ aday }: { aday: CitationQueueItem }) {
  const [busy, setBusy] = useState(false);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [not, setNot] = useState('');
  const p = aday.payload;
  const baslikId = `aday-${aday.id}`;
  const notId = `aday-not-${aday.id}`;

  async function karar(decision: 'onay' | 'ret') {
    setBusy(true);
    setError(null);
    const r = await istek(`/api/v1/admin/queues/citations/${aday.id}/decision`, {
      govde: { decision, ...(not.trim() ? { note: not.trim() } : {}) },
    });
    setBusy(false);
    if (r.ok) setSonuc(decision === 'onay' ? 'onaylandi' : 'reddedildi');
    else if (r.status === 404) setSonuc('zatenKarar');
    else setError(r.mesaj ?? s.hata);
  }

  const kaynak = aday.source;
  return (
    <article className={styles.aday} aria-labelledby={baslikId}>
      <h2 id={baslikId}>
        {s.turler[p.kind]}: {adayMetni(p)}
      </h2>
      <dl className={styles.ozet}>
        <dt>{s.kaynak}</dt>
        <dd>{kaynak ? kaynakMetni(kaynak) : s.kaynakYok}</dd>
        <dt>{s.guven}</dt>
        <dd>{yuzde.format(p.confidence)}</dd>
        {p.reasons.length ? (
          <>
            <dt>{s.gerekce}</dt>
            <dd>{p.reasons.join(', ')}</dd>
          </>
        ) : null}
        {p.kind === 'doktrin' && p.candidate.pages?.length ? (
          <>
            <dt>{s.sayfalar}</dt>
            <dd>{p.candidate.pages.join(', ')}</dd>
          </>
        ) : null}
      </dl>
      {p.context ? (
        <figure>
          <figcaption className={styles.soluk}>{s.baglam}</figcaption>
          <blockquote className={styles.baglam}>{p.context}</blockquote>
        </figure>
      ) : null}
      {sonuc ? (
        <p role="status" className={styles.durum}>
          {s[sonuc]}
        </p>
      ) : (
        <>
          <label className={styles.etiket} htmlFor={notId}>
            {s.not}
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
            <Dugme disabled={busy} aria-busy={busy} onClick={() => void karar('onay')}>
              {s.onayla}
            </Dugme>
            <Dugme tur="ikincil" disabled={busy} aria-busy={busy} onClick={() => void karar('ret')}>
              {s.reddet}
            </Dugme>
          </div>
        </>
      )}
    </article>
  );
}

/** Open citation candidates with onay and ret; each decision is applied and audited on the server. */
export function AtifKuyrugu({ adaylar }: { adaylar: CitationQueueItem[] }) {
  return (
    <div>
      {adaylar.map((a) => (
        <Aday key={a.id} aday={a} />
      ))}
    </div>
  );
}
