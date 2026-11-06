'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KartGorunumu } from '../_alan/kart.ts';
import {
  PUAN_DOGRU,
  cevapla,
  gecerliKart,
  ilerle,
  ilerlemeYuzdesi,
  karistir,
  sonCevap,
  turOzeti,
  turuBaslat,
  yanlislariTekrarEt,
  type Tur,
} from '../_alan/oyun.ts';
import { Geribildirim } from './Geribildirim.tsx';
import { KartSorusu } from './KartSorusu.tsx';
import { doldur, tr } from './metin.ts';
import styles from '../pratik.module.css';

/** A round has at most this many cards, so a round stays short (the true or false game is a quick round). */
export const TUR_BOYU = 10;

interface Props {
  kartlar: readonly KartGorunumu[];
  baslik: string;
  aciklama?: string;
  kapat?: () => void;
}

/** A scored round of one game: card number, score, progress bar, feedback, wrong list, "retry the wrong ones". */
export function OyunTuru({ kartlar, baslik, aciklama, kapat }: Props) {
  const kimlik = useId();
  const [tur, setTur] = useState<Tur | null>(null);

  const baslat = useCallback(() => {
    setTur(turuBaslat(karistir(kartlar, Date.now() % 2_147_483_647).slice(0, TUR_BOYU)));
  }, [kartlar]);

  const sec = useCallback((i: number) => setTur((t) => (t ? cevapla(t, i) : t)), []);

  if (!tur) {
    return (
      <section className={styles.oturum} aria-labelledby={`${kimlik}-baslik`}>
        <h2 id={`${kimlik}-baslik`}>{baslik}</h2>
        {aciklama ? <p>{aciklama}</p> : null}
        <p>{doldur(tr.oyunlar.kartSayisi, { sayi: Math.min(kartlar.length, TUR_BOYU) })}</p>
        <div className={styles.eylemler}>
          <button type="button" className="kz-dugme kz-dugme--birincil" onClick={baslat}>
            {tr.deneme.basla}
          </button>
          {kapat ? (
            <button type="button" className="kz-dugme kz-dugme--ikincil" onClick={kapat}>
              {tr.tur.desteyeDon}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (tur.asama === 'bitti') {
    return (
      <TurSonu tur={tur} baslik={baslik} kimlik={kimlik} yeniTur={setTur} baslat={baslat} kapat={kapat} />
    );
  }

  const kart = gecerliKart(tur);
  const cevap = sonCevap(tur);
  const cevaplandi = tur.asama === 'cevap' && cevap !== undefined;
  const sonKart = tur.sira + 1 >= tur.kartlar.length;
  return (
    <section className={styles.oturum} aria-labelledby={`${kimlik}-baslik`}>
      <h2 id={`${kimlik}-baslik`}>{baslik}</h2>
      <div className={styles.durumSatiri}>
        <p>
          {tur.turNo > 1 ? `${doldur(tr.tur.turNo, { no: tur.turNo })}: ` : ''}
          <strong>{doldur(tr.tur.kart, { no: tur.sira + 1, toplam: tur.kartlar.length })}</strong>
        </p>
        <p>
          <strong>
            {doldur(tr.tur.puan, { puan: tur.puan, enYuksek: tur.kartlar.length * PUAN_DOGRU })}
          </strong>
        </p>
      </div>
      <progress
        className={styles.ilerleme}
        value={ilerlemeYuzdesi(tur)}
        max={100}
        aria-label={tr.tur.ilerleme}
      >
        {ilerlemeYuzdesi(tur)}%
      </progress>
      <KartSorusu
        key={`${tur.turNo}-${kart.id}`}
        kart={kart}
        kimlik={`${kimlik}-${tur.turNo}-${tur.sira}`}
        secili={cevap && cevaplandi ? cevap.secim : null}
        goster={cevaplandi}
        kilitli={cevaplandi}
        onSec={sec}
        odakla={!cevaplandi}
      />
      {cevaplandi && cevap ? (
        <>
          <Geribildirim kart={kart} secim={cevap.secim} kimlik={`${kimlik}-${tur.turNo}-${tur.sira}`} />
          <div className={styles.eylemler}>
            <button type="button" className="kz-dugme kz-dugme--birincil" onClick={() => setTur(ilerle(tur))}>
              {sonKart ? tr.tur.son : tr.tur.devam}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function TurSonu({
  tur,
  baslik,
  kimlik,
  yeniTur,
  baslat,
  kapat,
}: {
  tur: Tur;
  baslik: string;
  kimlik: string;
  yeniTur: (t: Tur) => void;
  baslat: () => void;
  kapat?: () => void;
}) {
  const o = turOzeti(tur);
  const tekrar = yanlislariTekrarEt(tur);
  const baslikRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => baslikRef.current?.focus(), []);
  return (
    <section className={styles.oturum} aria-labelledby={`${kimlik}-sonuc`}>
      <h2 id={`${kimlik}-sonuc`} ref={baslikRef} tabIndex={-1}>
        {baslik}: {tr.tur.bitti}
      </h2>
      <p className={styles.buyukSayi}>{doldur(tr.tur.puan, { puan: o.puan, enYuksek: o.enYuksekPuan })}</p>
      <p>{doldur(tr.tur.ozet, { dogru: o.dogru, yanlis: o.yanlis })}</p>
      <progress className={styles.ilerleme} value={100} max={100} aria-label={tr.tur.ilerleme}>
        100%
      </progress>
      <h3>{tr.tur.yanlislar}</h3>
      {o.yanlislar.length === 0 ? (
        <p>{tr.tur.yanlislarYok}</p>
      ) : (
        <ol className={styles.yanlisListesi}>
          {o.yanlislar.map((k) => {
            const c = tur.cevaplar.find((x) => x.kartId === k.id);
            return (
              <li key={k.id}>
                <p>{k.soru}</p>
                <p>
                  {tr.tur.sizinCevap}: {c ? k.secenekler[c.secim] : tr.tur.cevaplanmadi}
                </p>
                <p>
                  {tr.tur.dogruCevap}: <strong>{k.secenekler[k.dogruIndex]}</strong>
                </p>
              </li>
            );
          })}
        </ol>
      )}
      <div className={styles.eylemler}>
        {tekrar ? (
          <button type="button" className="kz-dugme kz-dugme--birincil" onClick={() => yeniTur(tekrar)}>
            {tr.tur.yanlislariTekrar}
          </button>
        ) : null}
        <button type="button" className="kz-dugme kz-dugme--ikincil" onClick={baslat}>
          {tr.tur.yenidenOyna}
        </button>
        {kapat ? (
          <button type="button" className="kz-dugme kz-dugme--sessiz" onClick={kapat}>
            {tr.tur.desteyeDon}
          </button>
        ) : null}
      </div>
    </section>
  );
}
