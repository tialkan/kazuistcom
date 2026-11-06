'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { calismaKuyrugu, degerlendir, fsrsAyarlari, kartDurumunaCevir, type Depo } from '../_alan/depo.ts';
import { Derece, Durum, onizle, yeniKart } from '../_alan/fsrs.ts';
import type { KartGorunumu } from '../_alan/kart.ts';
import { calismaDerecesi } from '../_alan/oyun.ts';
import { Geribildirim } from './Geribildirim.tsx';
import { KartSorusu } from './KartSorusu.tsx';
import { doldur, tr } from './metin.ts';
import { useDepo } from './useDepo.ts';
import styles from '../pratik.module.css';

interface Props {
  kartlar: readonly KartGorunumu[];
  baslik: string;
  kapat?: () => void;
}

interface Oturum {
  kuyruk: string[];
  sira: number;
  secim: number | null;
  /** How many times a card was asked again in this session after a wrong answer. */
  tekrarlar: Record<string, number>;
  yanit: number;
  dogru: number;
  yeniIdler: string[];
}

const OTURUMDA_EN_FAZLA_TEKRAR = 1;

const sureMetni = (gun: number) => (gun <= 1 ? tr.calisma.yarin : doldur(tr.calisma.gun, { sayi: gun }));

/**
 * Spaced repetition session (FR-94): due cards first, then new cards up to the daily limit. A wrong answer is
 * rated Again and asked once more in the same session; a right answer is rated Hard, Good or Easy by the learner.
 */
export function Calisma({ kartlar, baslik, kapat }: Props) {
  const kimlik = useId();
  const { depo, guncelle, kaydedilemedi } = useDepo();
  const [oturum, setOturum] = useState<Oturum | null>(null);
  const byId = useMemo(() => new Map(kartlar.map((k) => [k.id, k])), [kartlar]);

  const baslat = useCallback(() => {
    if (!depo) return;
    const simdi = new Date();
    const k = calismaKuyrugu(
      kartlar.map((x) => x.id),
      depo,
      simdi,
    );
    setOturum({
      kuyruk: [...k.tekrar, ...k.yeni],
      sira: 0,
      secim: null,
      tekrarlar: {},
      yanit: 0,
      dogru: 0,
      yeniIdler: k.yeni,
    });
  }, [depo, kartlar]);

  if (!depo) {
    return (
      <section className={styles.oturum} aria-busy="true">
        <h2>{baslik}</h2>
        <p>{tr.bugun.yukleniyor}</p>
      </section>
    );
  }

  if (!oturum) {
    const k = calismaKuyrugu(
      kartlar.map((x) => x.id),
      depo,
      new Date(),
    );
    const toplam = k.tekrar.length + k.yeni.length;
    return (
      <section className={styles.oturum} aria-labelledby={`${kimlik}-baslik`}>
        <h2 id={`${kimlik}-baslik`}>{baslik}</h2>
        <ul className={styles.sayilar}>
          <li>
            <strong>{k.tekrar.length}</strong> {tr.bugun.vadesiGelen}
          </li>
          <li>
            <strong>{k.yeni.length}</strong> {tr.bugun.yeni}
          </li>
          {k.yeniBekleyen > 0 ? (
            <li>
              <strong>{k.yeniBekleyen}</strong> {tr.bugun.yeniBekleyen}
            </li>
          ) : null}
        </ul>
        {toplam === 0 ? <p>{tr.calisma.bosOturum}</p> : null}
        <div className={styles.eylemler}>
          <button
            type="button"
            className="kz-dugme kz-dugme--birincil"
            onClick={baslat}
            disabled={toplam === 0}
          >
            {tr.bugun.basla}
          </button>
          {kapat ? (
            <button type="button" className="kz-dugme kz-dugme--ikincil" onClick={kapat}>
              {tr.tur.desteyeDon}
            </button>
          ) : null}
        </div>
        {kaydedilemedi ? <p role="alert">{tr.deneme.kayitHatasi}</p> : null}
      </section>
    );
  }

  const kartId = oturum.kuyruk[oturum.sira];
  const kart = kartId ? byId.get(kartId) : undefined;
  if (!kart) {
    return (
      <Bitti
        baslik={baslik}
        kimlik={kimlik}
        oturum={oturum}
        yeniOturum={() => setOturum(null)}
        kapat={kapat}
      />
    );
  }

  const cevaplandi = oturum.secim !== null;
  const dogru = oturum.secim === kart.dogruIndex;
  const yeniKartMi = oturum.yeniIdler.includes(kart.id);

  const derecele = (derece: Derece) => {
    const simdi = new Date();
    guncelle((d) => degerlendir(d, kart.id, derece, simdi));
    setOturum((o) => {
      if (!o) return o;
      const tekrarlar = { ...o.tekrarlar };
      const kuyruk = [...o.kuyruk];
      if (derece === Derece.Tekrar && (tekrarlar[kart.id] ?? 0) < OTURUMDA_EN_FAZLA_TEKRAR) {
        tekrarlar[kart.id] = (tekrarlar[kart.id] ?? 0) + 1;
        kuyruk.push(kart.id);
      }
      return { ...o, kuyruk, tekrarlar, sira: o.sira + 1, secim: null };
    });
  };

  return (
    <section className={styles.oturum} aria-labelledby={`${kimlik}-baslik`}>
      <h2 id={`${kimlik}-baslik`}>{baslik}</h2>
      <div className={styles.durumSatiri}>
        <p>
          <strong>{doldur(tr.calisma.kalan, { sayi: oturum.kuyruk.length - oturum.sira })}</strong>
        </p>
        <p>
          <span className={styles.rozet}>{yeniKartMi ? tr.calisma.yeniEtiket : tr.calisma.tekrarEtiket}</span>
        </p>
      </div>
      <progress
        className={styles.ilerleme}
        value={oturum.sira}
        max={oturum.kuyruk.length}
        aria-label={tr.tur.ilerleme}
      >
        {oturum.sira} / {oturum.kuyruk.length}
      </progress>
      <KartSorusu
        key={`${kart.id}-${oturum.sira}`}
        kart={kart}
        kimlik={`${kimlik}-${oturum.sira}`}
        secili={oturum.secim}
        goster={cevaplandi}
        kilitli={cevaplandi}
        onSec={(i) =>
          setOturum((o) =>
            o && o.secim === null
              ? { ...o, secim: i, yanit: o.yanit + 1, dogru: o.dogru + (i === kart.dogruIndex ? 1 : 0) }
              : o,
          )
        }
        odakla={!cevaplandi}
      />
      {cevaplandi && oturum.secim !== null ? (
        <>
          <Geribildirim kart={kart} secim={oturum.secim} kimlik={`${kimlik}-${oturum.sira}`} />
          {dogru ? (
            <DereceDugmeleri
              depo={depo}
              kartId={kart.id}
              onDerece={(s) => derecele(calismaDerecesi(true, s))}
            />
          ) : (
            <div className={styles.derece}>
              <p>{tr.calisma.yanlisNot}</p>
              <div className={styles.eylemler}>
                <button
                  type="button"
                  className="kz-dugme kz-dugme--birincil"
                  onClick={() => derecele(calismaDerecesi(false, 3))}
                >
                  {tr.tur.devam}
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function DereceDugmeleri({
  depo,
  kartId,
  onDerece,
}: {
  depo: Depo;
  kartId: string;
  onDerece: (derece: 2 | 3 | 4) => void;
}) {
  const simdi = useRef(new Date());
  const onceki = depo.kartlar[kartId];
  const durum = onceki ? kartDurumunaCevir(onceki) : yeniKart(simdi.current);
  const gelecek = onizle(
    durum.state === Durum.Yeni ? yeniKart(simdi.current) : durum,
    simdi.current,
    fsrsAyarlari(depo),
  );
  const dugmeler: { derece: 2 | 3 | 4; etiket: string }[] = [
    { derece: 2, etiket: tr.calisma.zor },
    { derece: 3, etiket: tr.calisma.iyi },
    { derece: 4, etiket: tr.calisma.kolay },
  ];
  return (
    <div className={styles.derece} role="group" aria-label={tr.calisma.derece}>
      <p>{tr.calisma.derece}</p>
      <div className={styles.eylemler}>
        {dugmeler.map((d) => (
          <button
            key={d.derece}
            type="button"
            className={`kz-dugme ${d.derece === 3 ? 'kz-dugme--birincil' : 'kz-dugme--ikincil'}`}
            onClick={() => onDerece(d.derece)}
          >
            {d.etiket}
            <span className={styles.dereceSure}>
              {doldur(tr.calisma.sonraki, { sure: sureMetni(gelecek[d.derece].scheduledDays) })}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Bitti({
  baslik,
  kimlik,
  oturum,
  yeniOturum,
  kapat,
}: {
  baslik: string;
  kimlik: string;
  oturum: Oturum;
  yeniOturum: () => void;
  kapat?: () => void;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <section className={styles.oturum} aria-labelledby={`${kimlik}-bitti`}>
      <h2 id={`${kimlik}-bitti`} ref={ref} tabIndex={-1}>
        {baslik}: {tr.calisma.bitti}
      </h2>
      <p>{tr.calisma.bittiMetin}</p>
      <p>{doldur(tr.calisma.oturumOzeti, { sayi: oturum.yanit, dogru: oturum.dogru })}</p>
      <div className={styles.eylemler}>
        <button type="button" className="kz-dugme kz-dugme--ikincil" onClick={yeniOturum}>
          {tr.bugun.basla}
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
