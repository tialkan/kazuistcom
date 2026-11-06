'use client';

import { useState } from 'react';
import tr from '@kazuist/i18n/tr/yazma.json';
import { Dugme } from '@kazuist/ui';
import type { KuralAnahtari, KuralKaydi } from '../_cekirdek/kural-semasi.ts';
import { degerMetni } from './deger-metni.ts';
import { doldur, hataMesaji } from './yardimci.ts';
import styles from '../yazma.module.css';

const t = tr.sablon.denetim;

interface Bulgu {
  key: KuralAnahtari | string;
  status: 'uygun' | 'uyumsuz' | 'yok' | 'elle';
  expected?: unknown;
  found?: unknown;
  share?: number;
  detail?: string;
}
interface Rapor {
  summary: Record<'uygun' | 'uyumsuz' | 'yok' | 'elle', number>;
  findings: Bulgu[];
}

const durumSinifi = {
  uygun: styles.durumUygun,
  uyumsuz: styles.durumUyumsuz,
  yok: styles.durumYok,
  elle: styles.durumElle,
} as const;

function neden(b: Bulgu): string {
  if (b.key === 'sections' && b.found && typeof b.found === 'object') {
    const f = b.found as { missing?: string[]; outOfOrder?: boolean };
    const parcalar: string[] = [];
    if (f.missing?.length) parcalar.push(doldur(t.bolumler, { liste: f.missing.join(', ') }));
    if (f.outOfOrder) parcalar.push(t.bolumSirasi);
    return parcalar.join(' ');
  }
  const kod = b.detail ? (t.nedenler as Record<string, string>)[b.detail] : undefined;
  const pay =
    b.share !== undefined && b.status === 'uyumsuz'
      ? doldur(t.uygunPay, { yuzde: Math.round(b.share * 100) })
      : '';
  return [kod, pay].filter(Boolean).join(' ');
}

/** Check of a finished .docx against the rules on screen. The file goes to the check service and nowhere else. */
export function Denetim({ kayit }: { kayit: KuralKaydi }) {
  const [dosya, setDosya] = useState<File | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [rapor, setRapor] = useState<Rapor | null>(null);
  const [hata, setHata] = useState('');
  const [girisGerek, setGirisGerek] = useState(false);

  async function calistir() {
    if (!dosya) return;
    setCalisiyor(true);
    setHata('');
    setRapor(null);
    setGirisGerek(false);
    try {
      const f = new FormData();
      f.set('file', dosya);
      f.set('rules', JSON.stringify({ tur: kayit.tur, degerler: kayit.degerler }));
      const r = await fetch('/api/v1/templates/check', {
        method: 'POST',
        body: f,
        credentials: 'same-origin',
      });
      if (r.status === 401) setGirisGerek(true);
      else if (r.status === 503) setHata(t.kapali);
      else if (!r.ok) setHata(await hataMesaji(r, tr.hata.genel));
      else setRapor((await r.json()) as Rapor);
    } catch {
      setHata(tr.hata.genel);
    } finally {
      setCalisiyor(false);
    }
  }

  return (
    <section className={styles.adim} id="denetim" aria-labelledby="denetim-baslik">
      <h2 id="denetim-baslik">{t.baslik}</h2>
      <p className={styles.okuma}>{t.aciklama}</p>
      <div className="kz-alan">
        <label className="kz-alan__etiket" htmlFor="denetim-dosya">
          {t.dosya}
        </label>
        <p className="kz-alan__ipucu" id="denetim-dosya-ipucu">
          {t.dosyaIpucu}
        </p>
        <input
          id="denetim-dosya"
          className="kz-alan__girdi"
          type="file"
          accept=".docx"
          aria-describedby="denetim-dosya-ipucu"
          onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className={styles.eylemler}>
        <Dugme onClick={calistir} disabled={!dosya || calisiyor}>
          {t.calistir}
        </Dugme>
      </div>
      <p className={styles.durum} role="status" aria-live="polite">
        {calisiyor ? t.calisiyor : ''}
      </p>
      {girisGerek ? (
        <p className={`${styles.kutu} ${styles.kutuUyari}`}>
          {t.girisGerek} <a href="/giris">{tr.sablon.adim1.girisBaglantisi}</a>
        </p>
      ) : null}
      {hata ? (
        <p className={`${styles.kutu} ${styles.kutuHata}`} role="alert">
          {hata}
        </p>
      ) : null}
      {rapor ? (
        <div className={styles.sonuc}>
          <p className={styles.kutu}>{doldur(t.ozet, rapor.summary)}</p>
          <div className={`kz-tablo ${styles.tabloDuzen}`} role="region" aria-label={t.tablo} tabIndex={0}>
            <table>
              <caption>{t.tablo}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.alan}</th>
                  <th scope="col">{t.beklenen}</th>
                  <th scope="col">{t.bulunan}</th>
                  <th scope="col">{t.durum}</th>
                </tr>
              </thead>
              <tbody>
                {rapor.findings.map((b) => (
                  <tr key={b.key}>
                    <th scope="row">{(tr.sablon.adim2.alanlar as Record<string, string>)[b.key] ?? b.key}</th>
                    <td>{degerMetni(b.expected)}</td>
                    <td>{b.key === 'sections' ? '' : degerMetni(b.found)}</td>
                    <td>
                      <span className={durumSinifi[b.status]}>{t.durumlar[b.status]}</span>
                      {neden(b) ? (
                        <>
                          <br />
                          {neden(b)}
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
