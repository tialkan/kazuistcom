'use client';

import { useRef, useState } from 'react';
import type { AnswerEvent, SourceChip } from '@kazuist/contracts';
import ara from '@kazuist/i18n/tr/ara.json';
import ozet from '@kazuist/i18n/tr/ozet.json';
import { Dugme, KaynakCipi, SerhliMetin, SerhSatiri } from '@kazuist/ui';
import { doldur, otoriteSekli } from './metin.ts';
import { readSse } from './sse.ts';
import styles from '../ara.module.css';

type Cumle = Extract<AnswerEvent, { t: 'cumle' }>;
type Uyari = Extract<AnswerEvent, { t: 'uyari' }>;
type Asama = 'bekliyor' | 'akiyor' | 'bitti' | 'hata' | 'giris';

export interface OzetAlaniProps {
  q: string;
  filtreler: { type?: string; from?: string; to?: string; court?: string };
  girisVar: boolean;
  /** Record ids of the result cards on this page, so a chip can jump to its card. */
  gorunenKayitlar: string[];
}

const HATA_KODLARI: Record<number, string> = {
  402: ozet.hata.krediYetersiz,
  429: ozet.hata.cokFazla,
  503: ozet.hata.saglayiciYok,
};

/**
 * Sourced summary (plan 7.4, FR-16..21): streams POST /api/v1/answers and shows only validated sentences, each
 * with its sources in the margin (kenar şerhi) and its verbatim basis behind "Dayanağı göster".
 */
export function OzetAlani({ q, filtreler, girisVar, gorunenKayitlar }: OzetAlaniProps) {
  const [asama, setAsama] = useState<Asama>(girisVar ? 'bekliyor' : 'giris');
  const [cumleler, setCumleler] = useState<Cumle[]>([]);
  const [uyarilar, setUyarilar] = useState<Uyari[]>([]);
  const [kaynaklar, setKaynaklar] = useState<SourceChip[]>([]);
  const [cekimser, setCekimser] = useState<string | null>(null);
  const [kredi, setKredi] = useState<number | null>(null);
  const [hata, setHata] = useState('');
  const [acik, setAcik] = useState<Record<number, boolean>>({});
  const iptal = useRef<AbortController | null>(null);

  async function baslat() {
    iptal.current?.abort();
    const ctl = new AbortController();
    iptal.current = ctl;
    setAsama('akiyor');
    setCumleler([]);
    setUyarilar([]);
    setKaynaklar([]);
    setCekimser(null);
    setKredi(null);
    setHata('');
    setAcik({});
    const body: Record<string, unknown> = { q, mode: 'platform', depth: 'standart' };
    const f = Object.fromEntries(Object.entries(filtreler).filter(([, v]) => v));
    if (Object.keys(f).length) body.filters = f;
    try {
      const res = await fetch('/api/v1/answers', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (res.status === 401) {
        setAsama('giris');
        return;
      }
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setHata(HATA_KODLARI[res.status] ?? j?.message ?? ozet.hata.genel);
        setAsama('hata');
        return;
      }
      let son = false;
      for await (const frame of readSse(res.body)) {
        let ev: AnswerEvent;
        try {
          ev = JSON.parse(frame.data) as AnswerEvent;
        } catch {
          continue;
        }
        if (ev.t === 'kaynaklar') setKaynaklar(ev.kaynaklar);
        else if (ev.t === 'cumle') setCumleler((c) => [...c, ev]);
        else if (ev.t === 'uyari') setUyarilar((u) => [...u, ev]);
        else if (ev.t === 'cekimser') setCekimser(ev.metin);
        else if (ev.t === 'son') {
          son = true;
          setKredi(ev.creditsCharged);
        }
      }
      if (!son) {
        setHata(ozet.hata.baglanti);
        setAsama('hata');
        return;
      }
      setAsama('bitti');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setHata(ozet.hata.baglanti);
      setAsama('hata');
    }
  }

  const chip = (id: string): SourceChip | undefined => kaynaklar.find((k) => k.id === id);
  const no = (id: string): number => Number(id.replace(/\D/g, '')) || 0;
  const cumleUyarilari = (i: number) => uyarilar.filter((u) => u.cumleIndex === i);
  const sabit = uyarilar.filter((u) => u.cumleIndex === null || u.cumleIndex === undefined);
  const kullanilan = [...new Set(cumleler.flatMap((c) => c.kaynaklar))]
    .map((id) => chip(id))
    .filter((c): c is SourceChip => Boolean(c));

  const cipFor = (id: string) => {
    const c = chip(id);
    if (!c) return null;
    const href = gorunenKayitlar.includes(c.recordId) ? `#sonuc-${c.recordId}` : undefined;
    return (
      <KaynakCipi
        key={id}
        no={no(id)}
        kunye={c.title}
        otorite={otoriteSekli(c.authorityClass)}
        otoriteMetni={ara.otorite[c.authorityClass]}
        {...(href ? { href } : {})}
      />
    );
  };

  return (
    <section className={styles.ozet} aria-labelledby="ozet-baslik" aria-busy={asama === 'akiyor'}>
      <h2 id="ozet-baslik">{ozet.baslik}</h2>
      <p className={styles.ozetAciklama}>{ozet.aciklama}</p>
      {asama === 'giris' ? (
        <p className={styles.ozetGiris}>
          {ozet.girisGerekli} <a href="/giris">{ozet.girisBag}</a>
        </p>
      ) : (
        <>
          <p className={styles.ozetNot}>{ozet.aktarim}</p>
          <p className={styles.ozetNot}>{ozet.kredi}</p>
          <Dugme onClick={baslat} disabled={asama === 'akiyor'}>
            {asama === 'bitti' || asama === 'hata' ? ozet.yeniden : ozet.dugme}
          </Dugme>
        </>
      )}
      <p className={styles.ozetDurum} role="status" aria-live="polite">
        {asama === 'akiyor' ? ozet.hazirlaniyor : asama === 'bitti' ? ozet.tamamlandi : ''}
      </p>
      {asama === 'hata' ? (
        <p className={styles.hataMetni} role="alert">
          {hata}
        </p>
      ) : null}

      {cumleler.length ? (
        <div className={styles.ozetKagit}>
          <SerhliMetin etiket={ozet.baslik}>
            {cumleler.map((c) => (
              // The basis sits under the row, so on narrow screens the folded chips stay right under the sentence.
              <div key={c.index} className={styles.ozetSatir}>
                <SerhSatiri
                  serhEtiketi={ozet.cumleKaynaklari}
                  serh={<>{c.kaynaklar.map((k) => cipFor(k))}</>}
                >
                  <p className={styles.ozetCumle}>{c.metin}</p>
                  {c.destekleyici ? <p className={styles.ozetEk}>{ozet.destekleyici}</p> : null}
                  {cumleUyarilari(c.index)
                    .filter((u) => u.kod !== 'destekleyici_kaynak')
                    .map((u) => (
                      <p key={u.kod} className={styles.ozetUyari}>
                        {u.metin}
                      </p>
                    ))}
                </SerhSatiri>
                <button
                  type="button"
                  className={styles.dayanakDugme}
                  aria-expanded={Boolean(acik[c.index])}
                  aria-controls={`dayanak-${c.index}`}
                  onClick={() => setAcik((a) => ({ ...a, [c.index]: !a[c.index] }))}
                >
                  {acik[c.index] ? ozet.dayanagiGizle : ozet.dayanagiGoster}
                </button>
                <div id={`dayanak-${c.index}`} hidden={!acik[c.index]} className={styles.dayanak}>
                  {c.kaynaklar.map((k) => (
                    <figure key={k}>
                      <figcaption>
                        {doldur(ozet.kaynakNo, { no: no(k) })}: {chip(k)?.title}
                      </figcaption>
                      <blockquote>
                        <p>
                          <mark>{c.alinti[k]}</mark>
                        </p>
                      </blockquote>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </SerhliMetin>
        </div>
      ) : null}

      {cekimser ? (
        <div className={styles.cekimser} role="status">
          <p>{cekimser}</p>
          <p>{ozet.cekimserAciklama}</p>
        </div>
      ) : null}

      {/* FR-19 refers to "the sources below", so the fixed warnings come before the source list. */}
      {asama === 'bitti' ? (
        <div className={styles.sabitUyarilar}>
          {sabit.map((u) => (
            <p key={u.kod}>{u.metin}</p>
          ))}
        </div>
      ) : null}

      {asama === 'bitti' && kullanilan.length ? (
        <div className={styles.ozetKaynaklar}>
          <h3>{ozet.kaynaklar}</h3>
          <ul>
            {kullanilan.map((c) => (
              <li key={c.id}>{cipFor(c.id)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {asama === 'bitti' ? (
        <p className={styles.ozetNot}>{kredi ? doldur(ozet.harcanan, { kredi }) : ozet.dusmedi}</p>
      ) : null}
    </section>
  );
}
