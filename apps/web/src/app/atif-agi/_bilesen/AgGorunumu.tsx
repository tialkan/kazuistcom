'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  bagliIdler,
  cizgiler,
  cokAtifAlanIdleri,
  eserAtifSayilari,
  eserleriSirala,
  eserYillari,
  kararlariSirala,
  kunye,
  type Secim,
} from '../_alan/ag.ts';
import type { AtifAgi } from '../_alan/tipler.ts';
import { DetayPaneli } from './DetayPaneli.tsx';
import { doldur, tarihTr, tr } from './metin.ts';
import styles from '../atif-agi.module.css';

/** Columns show at most this many nodes; the table view has them all. */
export const SUTUN_SINIRI = 60;

/**
 * Two column interactive view (SRS section 4). Decisions on the left, works on the right. Nodes are native
 * buttons in two lists, so Tab, Enter and Space work and a screen reader reads real lists; the lines are an
 * aria-hidden SVG drawn from measured positions. Selecting a node marks its neighbours with a thick rubric edge
 * and a visually hidden text, and fills the detail panel (a polite live region).
 */
export function AgGorunumu({ ag }: { ag: AtifAgi }) {
  const [secim, setSecim] = useState<Secim>(null);
  const [konum, setKonum] = useState<Record<string, number>>({});
  const [yukseklik, setYukseklik] = useState(0);
  const kapsayici = useRef<HTMLDivElement>(null);
  const dugumler = useRef(new Map<string, HTMLElement>());
  const panelBaslik = useRef<HTMLHeadingElement>(null);
  const panelSecimi = useRef(false);

  const kararlar = useMemo(() => kararlariSirala(ag).slice(0, SUTUN_SINIRI), [ag]);
  const eserler = useMemo(() => eserleriSirala(ag).slice(0, SUTUN_SINIRI), [ag]);
  const sayilar = useMemo(() => eserAtifSayilari(ag), [ag]);
  const cok = useMemo(() => cokAtifAlanIdleri(ag), [ag]);
  const kararIdleri = useMemo(() => new Set(kararlar.map((k) => k.id)), [kararlar]);
  const eserIdleri = useMemo(() => new Set(eserler.map((e) => e.id)), [eserler]);
  const cizilen = useMemo(() => cizgiler(ag, kararIdleri, eserIdleri), [ag, kararIdleri, eserIdleri]);
  const bagli = useMemo(() => bagliIdler(ag, secim), [ag, secim]);
  const kararAtifSayisi = useCallback(
    (id: string) =>
      ag.workEdges.filter((e) => e.from === id).length +
      ag.edges.filter((e) => e.from === id).length +
      ag.externalCitations.filter((e) => e.from === id).length,
    [ag],
  );

  const olc = useCallback(() => {
    const kap = kapsayici.current;
    if (!kap) return;
    const ust = kap.getBoundingClientRect().top;
    const yeni: Record<string, number> = {};
    for (const [id, el] of dugumler.current) {
      const r = el.getBoundingClientRect();
      yeni[id] = r.top - ust + r.height / 2;
    }
    setKonum(yeni);
    setYukseklik(kap.getBoundingClientRect().height);
  }, []);

  useLayoutEffect(() => {
    olc();
  }, [olc, ag, secim]);

  useEffect(() => {
    const kap = kapsayici.current;
    if (!kap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(olc);
    ro.observe(kap);
    window.addEventListener('resize', olc);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', olc);
    };
  }, [olc]);

  useEffect(() => {
    if (panelSecimi.current) {
      panelBaslik.current?.focus();
      panelSecimi.current = false;
    }
  }, [secim]);

  const sec = (s: Secim, panelden = false) => {
    panelSecimi.current = panelden;
    setSecim((onceki) => (onceki && s && onceki.tur === s.tur && onceki.id === s.id && !panelden ? null : s));
  };

  const kaydet = (id: string) => (el: HTMLElement | null) => {
    if (el) dugumler.current.set(id, el);
    else dugumler.current.delete(id);
  };

  const durum = (tur: 'karar' | 'eser', id: string) => {
    const secili = secim?.tur === tur && secim.id === id;
    return { secili, bagli: !secili && bagli.has(id) };
  };

  const cizgiSecili = (from: string, work: string) =>
    secim !== null &&
    ((secim.tur === 'karar' && secim.id === from) || (secim.tur === 'eser' && secim.id === work));

  return (
    <div
      className={styles.agKap}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && secim) {
          e.preventDefault();
          setSecim(null);
        }
      }}
    >
      <p className={styles.ipucu} id="ag-ipucu">
        {tr.ag.ipucu}
      </p>
      <div className={styles.agDuzen}>
        <div
          className={styles.kolonlar}
          ref={kapsayici}
          role="group"
          aria-label={tr.ag.baslik}
          aria-describedby="ag-ipucu"
        >
          <section aria-labelledby="ag-kararlar" className={styles.kolon}>
            <h3 id="ag-kararlar">
              {tr.ag.kararlar}{' '}
              <span className={styles.ipucu}>({doldur(tr.ag.sayi, { sayi: ag.nodes.length })})</span>
            </h3>
            <ul className={styles.dugumListesi}>
              {kararlar.map((k) => {
                const d = durum('karar', k.id);
                return (
                  <li key={k.id}>
                    <button
                      type="button"
                      ref={kaydet(k.id)}
                      className={styles.dugum}
                      aria-pressed={d.secili}
                      data-bagli={d.bagli ? 'evet' : undefined}
                      onClick={() => sec({ tur: 'karar', id: k.id })}
                    >
                      <span className={styles.dugumBaslik}>{kunye(k)}</span>
                      <span className={styles.ipucu}>
                        {k.date ? <time dateTime={k.date}>{tarihTr(k.date)}</time> : null}
                        {k.date ? ' · ' : ''}
                        {doldur(tr.ag.atifSayisi, { sayi: kararAtifSayisi(k.id) })}
                      </span>
                      {d.secili ? <span className="kz-gorunmez"> ({tr.ag.secili})</span> : null}
                      {d.bagli ? <span className="kz-gorunmez"> ({tr.ag.bagli})</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className={styles.cizgiKap} aria-hidden="true">
            <svg
              className={styles.cizgiler}
              focusable="false"
              preserveAspectRatio="none"
              viewBox={`0 0 100 ${yukseklik || 1}`}
            >
              {cizilen.map((e) => {
                const y1 = konum[e.from];
                const y2 = konum[e.work];
                if (y1 === undefined || y2 === undefined) return null;
                const acik = cizgiSecili(e.from, e.work);
                return (
                  <path
                    key={`${e.from}|${e.work}`}
                    d={`M0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`}
                    className={acik ? styles.cizgiAcik : styles.cizgi}
                    vectorEffect="non-scaling-stroke"
                    fill="none"
                  />
                );
              })}
            </svg>
          </div>

          <section aria-labelledby="ag-eserler" className={styles.kolon}>
            <h3 id="ag-eserler">
              {tr.ag.eserler}{' '}
              <span className={styles.ipucu}>({doldur(tr.ag.sayi, { sayi: ag.works.length })})</span>
            </h3>
            <ul className={styles.dugumListesi}>
              {eserler.map((w) => {
                const d = durum('eser', w.id);
                const yillar = eserYillari(w);
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      ref={kaydet(w.id)}
                      className={styles.dugum}
                      data-cok={cok.has(w.id) ? 'evet' : undefined}
                      aria-pressed={d.secili}
                      data-bagli={d.bagli ? 'evet' : undefined}
                      onClick={() => sec({ tur: 'eser', id: w.id })}
                    >
                      <span className={styles.dugumBaslik}>{w.baslik}</span>
                      <span className={styles.ipucu}>
                        {w.yazarlar.join(', ')}
                        {' · '}
                        {doldur(tr.ag.kararda, { sayi: sayilar.get(w.id) ?? 0 })}
                        {yillar.length ? ` · ${doldur(tr.ag.yil, { yil: yillar.join(', ') })}` : ''}
                      </span>
                      {cok.has(w.id) ? <span className={styles.rozet}>{tr.ag.cokAtif}</span> : null}
                      {d.secili ? <span className="kz-gorunmez"> ({tr.ag.secili})</span> : null}
                      {d.bagli ? <span className="kz-gorunmez"> ({tr.ag.bagli})</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className={styles.panel} aria-labelledby="detay-baslik" aria-live="polite">
          <DetayPaneli ag={ag} secim={secim} onSec={(s) => sec(s, true)} baslikRef={panelBaslik} />
          {secim ? (
            <button type="button" className={styles.temizle} onClick={() => setSecim(null)}>
              {tr.ag.secimiTemizle}
            </button>
          ) : null}
        </aside>
      </div>
      {ag.nodes.length > SUTUN_SINIRI || ag.works.length > SUTUN_SINIRI ? (
        <p className={styles.ipucu}>{doldur(tr.ag.sinirli, { sinir: SUTUN_SINIRI })}</p>
      ) : null}
    </div>
  );
}
