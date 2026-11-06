'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  type BitisSonucu,
  denemeAnahtari,
  denemeyiBitir,
  denemeyiOku,
  sureBittiMi,
  yeniDeneme,
  type SaklananDeneme,
} from '../_alan/deneme-oturumu.ts';
import { denemeKur, kalanDakika, type DenemePlani } from '../_alan/deneme.ts';
import type { KartGorunumu } from '../_alan/kart.ts';
import { DogruIsareti, YanlisIsareti } from './Isaretler.tsx';
import { KartSorusu } from './KartSorusu.tsx';
import { doldur, sayiTr, tr } from './metin.ts';
import { useDepo } from './useDepo.ts';
import styles from '../pratik.module.css';

type Asama = 'yukleniyor' | 'hazir' | 'sinav' | 'sonuc';

const UYARI_DAKIKALARI = [30, 10, 5, 1];

function depodanOku(): string | null {
  try {
    return window.localStorage.getItem(denemeAnahtari);
  } catch {
    return null;
  }
}
function depoyaYaz(s: SaklananDeneme | null) {
  try {
    if (s) window.localStorage.setItem(denemeAnahtari, JSON.stringify(s));
    else window.localStorage.removeItem(denemeAnahtari);
  } catch {
    /* the exam still runs in memory */
  }
}

export function sureYazisi(dakika: number): string {
  const toplamSn = Math.max(0, Math.ceil(dakika * 60));
  return doldur(tr.deneme.sureFormat, {
    saat: Math.floor(toplamSn / 3600),
    dakika: Math.floor((toplamSn % 3600) / 60),
    saniye: toplamSn % 60,
  });
}

/**
 * The HMGS practice exam (FR-93): 120 questions and 155 minutes when the pool allows, otherwise a partial exam
 * that says so. The clock follows the wall time, the running exam survives a refresh, the time limit is enforced
 * by finishing the exam at zero, and the result gives the score, the pass mark and a report by subject.
 */
export function DenemeEkrani({ havuz }: { havuz: readonly KartGorunumu[] }) {
  const kimlik = useId();
  const { guncelle, kaydedilemedi } = useDepo();
  const [asama, setAsama] = useState<Asama>('yukleniyor');
  const [plan, setPlan] = useState<DenemePlani | null>(null);
  const [durum, setDurum] = useState<SaklananDeneme | null>(null);
  const [sonuc, setSonuc] = useState<BitisSonucu | null>(null);
  const [onayAcik, setOnayAcik] = useState(false);
  const [simdi, setSimdi] = useState(() => 0);
  const [duyuru, setDuyuru] = useState('');
  const duyurulan = useRef(new Set<number>());
  const bitirildi = useRef(false);

  const onizlemePlan = useMemo(() => denemeKur(havuz, 1), [havuz]);

  const bitir = useCallback(
    (sureBitti: boolean) => {
      if (!plan || !durum || bitirildi.current) return;
      bitirildi.current = true;
      const bitis = Date.now();
      // The exam counts time up to the limit only.
      const son = Math.min(bitis, durum.baslangic + plan.sureDakika * 60_000);
      const hesap = denemeyiBitir(
        guncelle((d) => d),
        plan,
        durum,
        son,
      );
      guncelle(() => hesap.depo);
      depoyaYaz(null);
      setSonuc(hesap);
      setAsama('sonuc');
      setOnayAcik(false);
      if (sureBitti) setDuyuru(tr.deneme.sureBitti);
    },
    [plan, durum, guncelle],
  );

  // Resume a running exam after the first client render.
  useEffect(() => {
    const t = Date.now();
    setSimdi(t);
    const kayit = denemeyiOku(depodanOku(), havuz);
    if (kayit) {
      setPlan(kayit.plan);
      setDurum(kayit.saklanan);
      setAsama('sinav');
    } else {
      depoyaYaz(null);
      setAsama('hazir');
    }
  }, [havuz]);

  // The clock.
  useEffect(() => {
    if (asama !== 'sinav') return;
    const id = window.setInterval(() => setSimdi(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [asama]);

  useEffect(() => {
    if (asama !== 'sinav' || !plan || !durum || simdi === 0) return;
    if (sureBittiMi(durum, plan, simdi)) {
      bitir(true);
      return;
    }
    // Announce the thresholds (30, 10, 5, 1 minutes) once each, politely; the visible clock does not announce.
    const kalan = kalanDakika(durum.baslangic, plan.sureDakika, simdi);
    const gecilen = UYARI_DAKIKALARI.filter((e) => kalan <= e && !duyurulan.current.has(e));
    if (gecilen.length) {
      for (const e of gecilen) duyurulan.current.add(e);
      setDuyuru(doldur(tr.deneme.dakikaUyari, { dakika: Math.min(...gecilen) }));
    }
  }, [asama, plan, durum, simdi, bitir]);

  const degistir = useCallback((fn: (s: SaklananDeneme) => SaklananDeneme) => {
    setDurum((s) => {
      if (!s) return s;
      const yeni = fn(s);
      depoyaYaz(yeni);
      return yeni;
    });
  }, []);

  const baslat = () => {
    const tohum = Date.now() % 2_147_483_647;
    const p = denemeKur(havuz, tohum);
    if (p.soruSayisi === 0) return;
    const s = yeniDeneme(p, tohum, Date.now());
    depoyaYaz(s);
    bitirildi.current = false;
    duyurulan.current = new Set();
    setPlan(p);
    setDurum(s);
    setSonuc(null);
    setDuyuru('');
    setSimdi(Date.now());
    setAsama('sinav');
  };

  if (asama === 'yukleniyor') {
    return (
      <section className={styles.oturum} aria-busy="true">
        <p>{tr.bugun.yukleniyor}</p>
      </section>
    );
  }

  if (asama === 'hazir') {
    return (
      <section className={styles.oturum} aria-labelledby={`${kimlik}-hazir`}>
        <h2 id={`${kimlik}-hazir`}>{tr.deneme.hazirBaslik}</h2>
        {onizlemePlan.soruSayisi === 0 ? (
          <p>{tr.bos.hmgsMetin}</p>
        ) : (
          <>
            <ul className={styles.sayilar}>
              <li>
                <strong>{doldur(tr.deneme.soruSayisi, { sayi: onizlemePlan.soruSayisi })}</strong>
              </li>
              <li>
                <strong>{doldur(tr.deneme.sure, { dakika: onizlemePlan.sureDakika })}</strong>
              </li>
            </ul>
            {onizlemePlan.tam ? (
              <p>{tr.hmgs.tam}</p>
            ) : (
              <div className={styles.not}>
                <h3>{tr.hmgs.kismi.baslik}</h3>
                <p>
                  {doldur(tr.hmgs.kismi.metin, {
                    mevcut: havuz.length,
                    soru: onizlemePlan.soruSayisi,
                    sure: onizlemePlan.sureDakika,
                  })}
                </p>
              </div>
            )}
            <p>{tr.deneme.hazirMetin}</p>
            <div className={styles.eylemler}>
              <button type="button" className="kz-dugme kz-dugme--birincil" onClick={baslat}>
                {tr.deneme.basla}
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  if (asama === 'sonuc' && sonuc) {
    return (
      <DenemeSonucu
        bitis={sonuc}
        havuz={havuz}
        yeniden={() => setAsama('hazir')}
        kimlik={kimlik}
        kayitYok={kaydedilemedi}
      />
    );
  }

  if (!plan || !durum) return null;
  const sorular = plan.sorular;
  const i = Math.min(durum.sira, sorular.length - 1);
  const soru = sorular[i] as KartGorunumu;
  const kalan = kalanDakika(durum.baslangic, plan.sureDakika, simdi || durum.baslangic);
  const bos = durum.cevaplar.filter((c) => c === null).length;
  const git = (n: number) => degistir((s) => ({ ...s, sira: Math.min(Math.max(0, n), sorular.length - 1) }));

  return (
    <section className={styles.oturum} aria-labelledby={`${kimlik}-sinav`}>
      <h2 id={`${kimlik}-sinav`} className="kz-gorunmez">
        {tr.meta.denemeBaslik}
      </h2>
      <div className={styles.durumSatiri}>
        <p>
          <strong>{doldur(tr.deneme.soruNo, { no: i + 1, toplam: sorular.length })}</strong>
        </p>
        <p>
          {tr.deneme.kalanSure}:{' '}
          <strong role="timer" aria-live="off" className={styles.sayac}>
            {sureYazisi(kalan)}
          </strong>
        </p>
      </div>
      <div className="kz-gorunmez" role="status" aria-live="polite">
        {duyuru}
      </div>
      <KartSorusu
        key={soru.id}
        kart={soru}
        kimlik={`${kimlik}-${i}`}
        secili={durum.cevaplar[i] ?? null}
        goster={false}
        kilitli={false}
        onSec={(c) => degistir((s) => ({ ...s, cevaplar: s.cevaplar.map((x, k) => (k === i ? c : x)) }))}
        odakla={false}
      />
      <div className={styles.eylemler}>
        <button
          type="button"
          className="kz-dugme kz-dugme--ikincil"
          onClick={() => git(i - 1)}
          disabled={i === 0}
        >
          {tr.deneme.onceki}
        </button>
        <button
          type="button"
          className="kz-dugme kz-dugme--ikincil"
          onClick={() => git(i + 1)}
          disabled={i === sorular.length - 1}
        >
          {tr.deneme.sonraki}
        </button>
        <button
          type="button"
          className="kz-dugme kz-dugme--sessiz"
          onClick={() =>
            degistir((s) => ({ ...s, cevaplar: s.cevaplar.map((x, k) => (k === i ? null : x)) }))
          }
          disabled={durum.cevaplar[i] === null}
        >
          {tr.deneme.temizle}
        </button>
        <button
          type="button"
          className="kz-dugme kz-dugme--sessiz"
          aria-pressed={durum.isaretler[i] === true}
          onClick={() =>
            degistir((s) => ({ ...s, isaretler: s.isaretler.map((x, k) => (k === i ? !x : x)) }))
          }
        >
          {durum.isaretler[i] ? tr.deneme.isaretKaldir : tr.deneme.isaretle}
        </button>
      </div>

      <nav aria-labelledby={`${kimlik}-palet`} className={styles.palet}>
        <h3 id={`${kimlik}-palet`}>{tr.deneme.palet}</h3>
        <p className={styles.ipucu}>{tr.deneme.paletAciklama}</p>
        <ol className={styles.paletListesi}>
          {sorular.map((s, k) => {
            const yanitli = durum.cevaplar[k] !== null;
            const isaretli = durum.isaretler[k] === true;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={styles.paletDugme}
                  aria-current={k === i ? 'step' : undefined}
                  data-yanitli={yanitli ? 'evet' : 'hayir'}
                  onClick={() => git(k)}
                >
                  <span>{k + 1}</span>
                  <span className={styles.paletIsaret} aria-hidden="true">
                    {yanitli ? '●' : '○'}
                    {isaretli ? '▲' : ''}
                  </span>
                  <span className="kz-gorunmez">
                    {yanitli ? tr.deneme.paletYanitli : tr.deneme.paletBos}
                    {isaretli ? `, ${tr.deneme.paletIsaretli}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className={styles.ipucu}>
          ● {tr.deneme.paletYanitli}, ○ {tr.deneme.paletBos}, ▲ {tr.deneme.paletIsaretli}
        </p>
      </nav>

      {onayAcik ? (
        <div className={styles.not} role="alertdialog" aria-labelledby={`${kimlik}-onay`}>
          <p id={`${kimlik}-onay`}>{doldur(tr.deneme.bitirOnay, { bos })}</p>
          <div className={styles.eylemler}>
            <button type="button" className="kz-dugme kz-dugme--birincil" onClick={() => bitir(false)}>
              {tr.deneme.bitirEvet}
            </button>
            <button
              type="button"
              className="kz-dugme kz-dugme--ikincil"
              onClick={() => setOnayAcik(false)}
              autoFocus
            >
              {tr.deneme.bitirHayir}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.eylemler}>
          <button type="button" className="kz-dugme kz-dugme--birincil" onClick={() => setOnayAcik(true)}>
            {tr.deneme.bitir}
          </button>
        </div>
      )}
    </section>
  );
}

function DenemeSonucu({
  bitis,
  havuz,
  yeniden,
  kimlik,
  kayitYok,
}: {
  bitis: BitisSonucu;
  havuz: readonly KartGorunumu[];
  yeniden: () => void;
  kimlik: string;
  kayitYok: boolean;
}) {
  const { sonuc, gecenDakika } = bitis;
  const baslikRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => baslikRef.current?.focus(), []);
  const byId = new Map(havuz.map((k) => [k.id, k]));
  const tam = sonuc.soruSayisi === 120;
  const sn = Math.round(gecenDakika * 60);
  return (
    <section className={styles.oturum} aria-labelledby={`${kimlik}-sonuc`}>
      <h2 id={`${kimlik}-sonuc`} ref={baslikRef} tabIndex={-1}>
        {tr.deneme.sonuc.baslik}
      </h2>
      <p className={styles.buyukSayi}>
        {tr.deneme.sonuc.puan}: {doldur(tr.deneme.sonuc.puanDeger, { puan: sayiTr(sonuc.puan, 1) })}
      </p>
      <p className={styles.barajSonucu} data-baraj={sonuc.baraj ? 'gecti' : 'kaldi'}>
        {sonuc.baraj ? <DogruIsareti /> : <YanlisIsareti />}
        <span>{sonuc.baraj ? tr.deneme.sonuc.barajGecti : tr.deneme.sonuc.barajKaldi}</span>
      </p>
      <p className={styles.ipucu}>{tr.deneme.sonuc.barajNot}</p>
      {!tam ? <p>{doldur(tr.deneme.sonuc.olcekNot, { soru: sonuc.soruSayisi })}</p> : null}
      <dl className={styles.ozet}>
        <div>
          <dt>{tr.deneme.sonuc.dogru}</dt>
          <dd>{sonuc.dogru}</dd>
        </div>
        <div>
          <dt>{tr.deneme.sonuc.yanlis}</dt>
          <dd>{sonuc.yanlis}</dd>
        </div>
        <div>
          <dt>{tr.deneme.sonuc.bos}</dt>
          <dd>{sonuc.bos}</dd>
        </div>
        <div>
          <dt>{tr.deneme.sonuc.sure}</dt>
          <dd>
            {doldur(tr.deneme.sureFormat, {
              saat: Math.floor(sn / 3600),
              dakika: Math.floor((sn % 3600) / 60),
              saniye: sn % 60,
            })}
          </dd>
        </div>
      </dl>
      {kayitYok ? <p role="alert">{tr.deneme.kayitHatasi}</p> : null}

      <h3>{tr.hmgs.rapor.baslik}</h3>
      <div className={styles.tabloSar} role="region" aria-label={tr.hmgs.rapor.baslik} tabIndex={0}>
        <table className={styles.tablo}>
          <caption className="kz-gorunmez">{tr.hmgs.rapor.aciklama}</caption>
          <thead>
            <tr>
              <th scope="col">{tr.hmgs.rapor.alan}</th>
              <th scope="col">{tr.hmgs.rapor.dogru}</th>
              <th scope="col">{tr.hmgs.rapor.oran}</th>
            </tr>
          </thead>
          <tbody>
            {sonuc.alanlar.map((a) => (
              <tr key={a.slug}>
                <th scope="row">{a.ad}</th>
                <td>
                  {a.dogru} / {a.toplam}
                </td>
                <td>%{sayiTr(a.oran * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        {sonuc.tekrarKartlari.length
          ? doldur(tr.deneme.sonuc.tekrarNot, { sayi: sonuc.tekrarKartlari.length })
          : tr.deneme.sonuc.tekrarYok}
      </p>
      {sonuc.tekrarKartlari.length ? (
        <>
          <h3>{tr.deneme.sonuc.yanlislar}</h3>
          <ol className={styles.yanlisListesi}>
            {sonuc.tekrarKartlari.map((id) => {
              const k = byId.get(id);
              return k ? (
                <li key={id}>
                  <p>{k.soru}</p>
                  <p>
                    {tr.tur.dogruCevap}: <strong>{k.secenekler[k.dogruIndex]}</strong>
                  </p>
                  <p className={styles.kanunKunye}>{k.kanun[0]?.ref}</p>
                </li>
              ) : null;
            })}
          </ol>
        </>
      ) : null}
      <div className={styles.eylemler}>
        <button type="button" className="kz-dugme kz-dugme--birincil" onClick={yeniden}>
          {tr.deneme.sonuc.yenidenDene}
        </button>
        <a className="kz-dugme kz-dugme--ikincil" href="/pratik/hmgs#rapor">
          {tr.deneme.sonuc.rapor}
        </a>
      </div>
    </section>
  );
}
