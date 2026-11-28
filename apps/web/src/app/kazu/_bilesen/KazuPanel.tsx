'use client';

import { useState } from 'react';
import tr from '@kazuist/i18n/tr/kazu.json';
import {
  bolumler,
  otomatikKontroller,
  type Calisma,
  type KaynakNotu,
  type PmDugum,
  type Vaka,
} from '../_cekirdek/analiz.ts';

const P = tr.panel;
type Adim = keyof typeof P.asama;

/** Kazu panel: the eight steps of docs/kazu/danismanlik-ilkeleri.md, each leaving something checkable. */
export function KazuPanel({
  govde,
  baslik,
  calisma,
  setCalisma,
}: {
  govde: PmDugum | null;
  baslik: string;
  calisma: Calisma;
  setCalisma: (c: Calisma) => void;
}) {
  const [acik, setAcik] = useState<Adim>('2');
  const guncelle = (p: Partial<Calisma>) => setCalisma({ ...calisma, ...p });
  return (
    <aside className="kazu-panel" aria-label={P.baslik}>
      <h2>{P.baslik}</h2>
      <ol className="kazu-asamalar" aria-label={P.asamalar}>
        {(Object.entries(P.asama) as [Adim, string][]).map(([n, ad]) => (
          <li key={n}>
            <button
              type="button"
              aria-current={acik === n ? 'step' : undefined}
              className={n === '1' ? 'tamam' : ''}
              onClick={() => setAcik(n)}
            >
              <span className="kazu-no">{n}</span>
              {ad}
            </button>
          </li>
        ))}
      </ol>
      {acik === '2' ? <IddiaKarti c={calisma} guncelle={guncelle} /> : null}
      {acik === '3' ? <Kaynaklar c={calisma} guncelle={guncelle} /> : null}
      {acik === '4' ? <Yapi govde={govde} /> : null}
      {acik === '5' ? <SifirinciTaslak govde={govde} /> : null}
      {acik === '6' ? <ZorVaka c={calisma} guncelle={guncelle} /> : null}
      {acik === '7' ? <Turlar c={calisma} guncelle={guncelle} /> : null}
      {acik === '8' ? <TeslimKontrolu govde={govde} baslik={baslik} c={calisma} guncelle={guncelle} /> : null}
    </aside>
  );
}

type Bolge = { c: Calisma; guncelle: (p: Partial<Calisma>) => void };

function Alan({
  etiket,
  deger,
  ipucu,
  onDegis,
  satir = 2,
}: {
  etiket: string;
  deger: string;
  ipucu?: string;
  onDegis: (v: string) => void;
  satir?: number;
}) {
  return (
    <label className="kazu-alan">
      <span>{etiket}</span>
      <textarea rows={satir} value={deger} placeholder={ipucu} onChange={(e) => onDegis(e.target.value)} />
    </label>
  );
}

function IddiaKarti({ c, guncelle }: Bolge) {
  const sorular = Object.keys(P.iddia.soru) as (keyof Calisma['iddia'])[];
  return (
    <section className="kazu-kart">
      <h3>{P.iddia.baslik}</h3>
      <p className="kazu-soluk">{P.iddia.aciklama}</p>
      {sorular.map((s) => (
        <Alan
          key={s}
          etiket={P.iddia.soru[s]}
          deger={c.iddia[s]}
          ipucu={P.iddia.ipucu[s]}
          onDegis={(v) => guncelle({ iddia: { ...c.iddia, [s]: v } })}
        />
      ))}
    </section>
  );
}

function Kaynaklar({ c, guncelle }: Bolge) {
  const degis = (i: number, p: Partial<KaynakNotu>) =>
    guncelle({ kaynaklar: c.kaynaklar.map((k, j) => (j === i ? { ...k, ...p } : k)) });
  return (
    <section className="kazu-kart">
      <h3>{P.kaynak.baslik}</h3>
      <p className="kazu-soluk">{P.kaynak.aciklama}</p>
      {c.kaynaklar.map((k, i) => (
        <fieldset key={i} className="kazu-kayit">
          <legend className="kazu-gizli">
            {P.kaynak.eser} {i + 1}
          </legend>
          <label className="kazu-alan">
            <span>{P.kaynak.eser}</span>
            <input value={k.eser} onChange={(e) => degis(i, { eser: e.target.value })} />
          </label>
          <label className="kazu-alan">
            <span>{P.kaynak.yer}</span>
            <input value={k.yer} onChange={(e) => degis(i, { yer: e.target.value })} />
          </label>
          <Alan etiket={P.kaynak.iddia} deger={k.iddia} onDegis={(v) => degis(i, { iddia: v })} />
          <label className="kazu-alan">
            <span>{P.kaynak.tur}</span>
            <select value={k.tur} onChange={(e) => degis(i, { tur: e.target.value as KaynakNotu['tur'] })}>
              <option value="asil">{P.kaynak.asil}</option>
              <option value="ikincil">{P.kaynak.ikincil}</option>
            </select>
          </label>
          <button
            type="button"
            className="kazu-bag"
            onClick={() => guncelle({ kaynaklar: c.kaynaklar.filter((_, j) => j !== i) })}
          >
            {P.kaynak.sil}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="kazu-ikincil"
        onClick={() =>
          guncelle({ kaynaklar: [...c.kaynaklar, { eser: '', yer: '', iddia: '', tur: 'asil' }] })
        }
      >
        {P.kaynak.ekle}
      </button>
      <p className="kazu-soluk">{P.kaynak.ipucu}</p>
    </section>
  );
}

function Yapi({ govde }: { govde: PmDugum | null }) {
  const b = bolumler(govde);
  return (
    <section className="kazu-kart">
      <h3>{P.yapi.baslik}</h3>
      <p className="kazu-soluk">{P.yapi.aciklama}</p>
      {b.length ? (
        <ol className="kazu-anahat">
          {b.map((x, i) => (
            <li key={i} className={x.seviye > 2 ? 'alt' : ''}>
              <span>{x.baslik || P.yapi.adsiz}</span>
              <small className="kazu-soluk">
                {x.kelime} {P.yapi.kelime}
                {x.not ? ` · ${x.not} ${P.yapi.not}` : ''}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="kazu-soluk">{P.yapi.bos}</p>
      )}
    </section>
  );
}

function SifirinciTaslak({ govde }: { govde: PmDugum | null }) {
  const notlu = bolumler(govde).filter((x) => x.not > 0);
  return (
    <section className="kazu-kart">
      <h3>{P.taslak.baslik}</h3>
      <p className="kazu-soluk">{P.taslak.aciklama}</p>
      <h4>{P.taslak.notlar}</h4>
      {notlu.length ? (
        <ul className="kazu-anahat">
          {notlu.map((x, i) => (
            <li key={i}>
              <span>{x.baslik || P.yapi.adsiz}</span>
              <small className="kazu-soluk">
                {x.not} {P.yapi.not}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="kazu-soluk">{P.taslak.notYok}</p>
      )}
      <p className="kazu-soluk">{P.taslak.ipucu}</p>
    </section>
  );
}

function ZorVaka({ c, guncelle }: Bolge) {
  const degis = (i: number, p: Partial<Vaka>) =>
    guncelle({ vakalar: c.vakalar.map((v, j) => (j === i ? { ...v, ...p } : v)) });
  const turler = Object.entries(P.vaka.turler);
  return (
    <section className="kazu-kart">
      <h3>{P.vaka.baslik}</h3>
      <p className="kazu-soluk">{P.vaka.aciklama}</p>
      {c.vakalar.map((v, i) => (
        <fieldset key={i} className="kazu-kayit">
          <legend className="kazu-gizli">
            {P.vaka.tur} {i + 1}
          </legend>
          <label className="kazu-alan">
            <span>{P.vaka.tur}</span>
            <select value={v.tur} onChange={(e) => degis(i, { tur: e.target.value })}>
              {turler.map(([k, ad]) => (
                <option key={k} value={k}>
                  {ad}
                </option>
              ))}
            </select>
          </label>
          <Alan etiket={P.vaka.mevcut} deger={v.mevcut} onDegis={(x) => degis(i, { mevcut: x })} />
          <Alan etiket={P.vaka.oneri} deger={v.oneri} onDegis={(x) => degis(i, { oneri: x })} />
          <Alan etiket={P.vaka.fark} deger={v.fark} onDegis={(x) => degis(i, { fark: x })} />
          <Alan etiket={P.vaka.kabul} deger={v.kabul} onDegis={(x) => degis(i, { kabul: x })} />
          <button
            type="button"
            className="kazu-bag"
            onClick={() => guncelle({ vakalar: c.vakalar.filter((_, j) => j !== i) })}
          >
            {P.vaka.sil}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="kazu-ikincil"
        onClick={() =>
          guncelle({
            vakalar: [
              ...c.vakalar,
              {
                tur: turler[Math.min(c.vakalar.length, turler.length - 1)]?.[0] ?? 'tipik',
                mevcut: '',
                oneri: '',
                fark: '',
                kabul: '',
              },
            ],
          })
        }
      >
        {P.vaka.ekle}
      </button>
      <h4>{P.vaka.itirazBaslik}</h4>
      <Alan etiket={P.vaka.itiraz} deger={c.itiraz} onDegis={(x) => guncelle({ itiraz: x })} satir={3} />
      <Alan etiket={P.vaka.cevap} deger={c.cevap} onDegis={(x) => guncelle({ cevap: x })} satir={3} />
    </section>
  );
}

function Turlar({ c, guncelle }: Bolge) {
  const adlar = Object.entries(P.tur.adlar) as [keyof typeof P.tur.adlar, string][];
  return (
    <section className="kazu-kart">
      <h3>{P.tur.baslik}</h3>
      <p className="kazu-soluk">{P.tur.aciklama}</p>
      <div className="kazu-turler kazu-turler--dikey" role="radiogroup" aria-label={P.tur.simdi}>
        {adlar.map(([n, ad]) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={c.tur === Number(n)}
            className={c.tur === Number(n) ? 'secili' : ''}
            onClick={() => guncelle({ tur: Number(n) })}
          >
            {n}. {ad}
          </button>
        ))}
      </div>
      <p>{P.tur.ipucu[String(c.tur) as keyof typeof P.tur.ipucu]}</p>
    </section>
  );
}

function TeslimKontrolu({ govde, baslik, c, guncelle }: Bolge & { govde: PmDugum | null; baslik: string }) {
  const oto = otomatikKontroller(govde, baslik, c);
  const el = Object.entries(P.kontrol.el);
  return (
    <section className="kazu-kart">
      <h3>{P.kontrol.baslik}</h3>
      <h4>{P.kontrol.otomatik}</h4>
      <ul className="kazu-kontrol">
        {oto.map((k) => (
          <li key={k.id} className={k.durum}>
            <span aria-hidden="true">{k.durum === 'tamam' ? '✓' : '!'}</span>
            <span>
              {P.kontrol.madde[k.id as keyof typeof P.kontrol.madde]}
              {k.sayi ? ` (${k.sayi})` : ''}
            </span>
            <span className="kazu-gizli">{k.durum === 'tamam' ? P.kontrol.tamam : P.kontrol.eksik}</span>
          </li>
        ))}
      </ul>
      <h4>{P.kontrol.elle}</h4>
      <ul className="kazu-kontrol">
        {el.map(([id, ad]) => (
          <li key={id}>
            <label>
              <input
                type="checkbox"
                checked={!!c.isaret[id]}
                onChange={(e) => guncelle({ isaret: { ...c.isaret, [id]: e.target.checked } })}
              />{' '}
              {ad}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
