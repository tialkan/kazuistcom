'use client';

import { useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Dugme, FormAlani, Tablo } from '@kazuist/ui';
import { sayiTr } from '@kazuist/i18n';
import tr from '@kazuist/i18n/tr/tespit.json';
import {
  EN_FAZLA_KARAKTER,
  denetle,
  parcala,
  type Aile,
  type Bulgu,
  type OlcumAnahtari,
  type Sonuc,
} from '../_veri/denetle.ts';
import { doldur } from './kopyala.ts';
import styles from '../tespit.module.css';

const t = tr.denetleyici;
const ILK_GOSTERIM = 100;
const ENGEL_SAYISI = 1000;

type Filtre = 'tum' | 'kesin' | 'kesinOlasi';
type Ritmim = keyof typeof t.ritim;

const kuralBagi = (kural: string) => `#kural-${kural.replace('.', '-')}`;
const yuzde = (n: number) => sayiTr(Math.round(n * 100));

/**
 * Browser side checker. The pasted text lives only in this component's state: there is no request, no
 * storage and no logging anywhere on this path (test: tespit.test.ts scans the sources for them).
 */
export function Denetleyici({ kuralOzetleri }: { kuralOzetleri: Record<string, string> }) {
  const kimlik = useId();
  const [metin, setMetin] = useState('');
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [hata, setHata] = useState('');
  const [durum, setDurum] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tum');
  const [hepsi, setHepsi] = useState(false);
  const sonucBasligi = useRef<HTMLHeadingElement>(null);

  function calistir(girdi: string) {
    setHepsi(false);
    if (!girdi.trim()) {
      setHata(t.hata.bos);
      setSonuc(null);
      setDurum('');
      return;
    }
    if (girdi.length > EN_FAZLA_KARAKTER) {
      setHata(doldur(t.hata.uzun, { sinir: sayiTr(EN_FAZLA_KARAKTER), sayi: sayiTr(girdi.length) }));
      setSonuc(null);
      setDurum('');
      return;
    }
    setHata('');
    const s = denetle(girdi);
    setSonuc(s);
    const iz = s.say.kesin + s.say.olasi + s.say.zayif;
    setDurum(iz > 0 ? doldur(t.durum.iz, { sayi: sayiTr(iz) }) : t.durum.yok);
    // Move focus to the result so screen reader users land on it.
    requestAnimationFrame(() => sonucBasligi.current?.focus());
  }

  function temizle() {
    setMetin('');
    setSonuc(null);
    setHata('');
    setDurum(t.durum.temizlendi);
  }

  function ornekYukle() {
    setMetin(t.ornek);
    calistir(t.ornek);
  }

  return (
    <div className={styles.denetleyici}>
      <aside className={styles.gizlilik} aria-labelledby={`${kimlik}-gizlilik`}>
        <h3 id={`${kimlik}-gizlilik`}>{t.gizlilik.baslik}</h3>
        <p>{t.gizlilik.metin}</p>
      </aside>
      <aside className={styles.uyari} aria-labelledby={`${kimlik}-uyari`}>
        <h3 id={`${kimlik}-uyari`}>{t.uyari.baslik}</h3>
        <p>{t.uyari.metin}</p>
      </aside>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          calistir(metin);
        }}
        noValidate
      >
        <FormAlani
          id="tespit-metin"
          etiket={t.alan.etiket}
          ipucu={doldur(t.alan.ipucu, { sinir: sayiTr(EN_FAZLA_KARAKTER) })}
          hata={hata || undefined}
          cokSatir
          rows={12}
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          placeholder={t.alan.yertutucu}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={styles.metinAlani}
        />
        <div className={styles.dugmeSirasi}>
          <Dugme type="submit">{t.dugme.denetle}</Dugme>
          <Dugme tur="ikincil" onClick={ornekYukle}>
            {t.dugme.ornek}
          </Dugme>
          <Dugme tur="sessiz" onClick={temizle}>
            {t.dugme.temizle}
          </Dugme>
        </div>
      </form>

      <p className={styles.durum} role="status" aria-live="polite" aria-atomic="true">
        {durum}
      </p>

      {sonuc ? (
        <Sonuclar
          sonuc={sonuc}
          kuralOzetleri={kuralOzetleri}
          filtre={filtre}
          setFiltre={setFiltre}
          hepsi={hepsi}
          setHepsi={setHepsi}
          baslikRef={sonucBasligi}
        />
      ) : null}
    </div>
  );
}

function Sonuclar({
  sonuc,
  kuralOzetleri,
  filtre,
  setFiltre,
  hepsi,
  setHepsi,
  baslikRef,
}: {
  sonuc: Sonuc;
  kuralOzetleri: Record<string, string>;
  filtre: Filtre;
  setFiltre: (f: Filtre) => void;
  hepsi: boolean;
  setHepsi: (b: boolean) => void;
  baslikRef: RefObject<HTMLHeadingElement | null>;
}) {
  const iz = sonuc.say.kesin + sonuc.say.olasi + sonuc.say.zayif;
  const uyarilar = sonuc.olcumler.filter((o) => o.uyari);
  const turler = Object.entries(sonuc.ailelerSay) as Array<[Aile, number]>;
  const r = sonuc.ritim;
  const sayi = (n: number | null, kesir = 0) => (n === null ? t.ritim.olculmedi : sayiTr(n, kesir));

  const ritimSatirlari: Array<{ anahtar: Ritmim; deger: string }> = [
    { anahtar: 'cumleSayisi', deger: sayi(r.cumleSayisi) },
    { anahtar: 'ortalama', deger: sayi(r.ortalama, 1) },
    { anahtar: 'enKisa', deger: sayi(r.enKisa) },
    { anahtar: 'enUzun', deger: sayi(r.enUzun) },
    { anahtar: 'sapma', deger: sayi(r.sapma, 2) },
    { anahtar: 'degiskenlik', deger: sayi(r.degiskenlik, 2) },
    {
      anahtar: 'mektedir',
      deger: r.mektedirOrani === null ? t.ritim.olculmedi : `%${yuzde(r.mektedirOrani)}`,
    },
    { anahtar: 'dir', deger: r.dirOrani === null ? t.ritim.olculmedi : `%${yuzde(r.dirOrani)}` },
  ];

  const gorunen = useMemo(() => {
    const ucuz = sonuc.bulgular.filter((b) => {
      if (filtre === 'kesin') return b.siddet === 'kesin';
      if (filtre === 'kesinOlasi') return b.siddet === 'kesin' || b.siddet === 'olasi';
      return true;
    });
    return ucuz;
  }, [sonuc, filtre]);
  const sinir = hepsi ? ENGEL_SAYISI : ILK_GOSTERIM;
  const listelenen = gorunen.slice(0, sinir);

  const parcalar = useMemo(
    () =>
      parcala(
        sonuc.metin,
        sonuc.bulgular.filter((b) => !b.aralik),
      ),
    [sonuc],
  );
  const parcaKimligi = useMemo(() => {
    const harita = new Map<number, string>();
    parcalar.forEach((p, i) => {
      for (const sira of p.bulgular) if (!harita.has(sira)) harita.set(sira, `iz-${i}`);
    });
    return harita;
  }, [parcalar]);

  function goster(b: Bulgu) {
    const hedef = parcaKimligi.get(b.sira);
    if (!hedef) return;
    const el = document.getElementById(hedef);
    const azHareket = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'center', behavior: azHareket ? 'auto' : 'smooth' });
  }

  return (
    <section className={styles.sonuc} aria-labelledby="tespit-sonuc-baslik">
      <h3 id="tespit-sonuc-baslik" ref={baslikRef} tabIndex={-1}>
        {t.sonuc.baslik}
      </h3>

      <h4>{t.sonuc.ozetBaslik}</h4>
      <dl className={styles.ozet}>
        <Sayi etiket={t.sonuc.sozcuk} deger={sayiTr(sonuc.sozcuk)} />
        <Sayi etiket={t.sonuc.cumle} deger={sayiTr(sonuc.cumle)} />
        <Sayi etiket={t.sonuc.kesin} deger={sayiTr(sonuc.say.kesin)} />
        <Sayi etiket={t.sonuc.olasi} deger={sayiTr(sonuc.say.olasi)} />
        <Sayi etiket={t.sonuc.zayif} deger={sayiTr(sonuc.say.zayif)} />
        <Sayi etiket={t.sonuc.bilgi} deger={sayiTr(sonuc.say.bilgi)} />
        <Sayi
          etiket={t.sonuc.yogunluk}
          deger={sonuc.yogunluk === null ? t.ritim.olculmedi : sayiTr(sonuc.yogunluk, 1)}
        />
        <Sayi etiket={t.sonuc.turSayisi} deger={sayiTr(turler.length)} />
      </dl>
      <p className={styles.not}>{t.sonuc.aciklama}</p>

      {turler.length > 0 ? (
        <Tablo
          baslik={t.sonuc.turlerBaslik}
          satirAnahtari={([tur]) => tur}
          sutunlar={[
            { anahtar: 'tur', baslik: t.sonuc.tur, hucre: ([tur]) => t.tur[tur] },
            { anahtar: 'adet', baslik: t.sonuc.adet, hucre: ([, n]) => sayiTr(n), sayisal: true },
          ]}
          satirlar={turler.sort((a, b) => b[1] - a[1])}
        />
      ) : null}

      <h4>{t.ritim.baslik}</h4>
      <Tablo
        baslik={t.ritim.baslik}
        satirAnahtari={(s) => s.anahtar}
        sutunlar={[
          { anahtar: 'olcu', baslik: t.ritim.olcu, hucre: (s) => t.ritim[s.anahtar] },
          { anahtar: 'deger', baslik: t.ritim.deger, hucre: (s) => s.deger, sayisal: true },
        ]}
        satirlar={ritimSatirlari}
        not={t.ritim.not}
      />

      {uyarilar.length > 0 ? (
        <>
          <h4>{t.olcum.baslik}</h4>
          <ul className={styles.olcumler}>
            {uyarilar.map((o) => (
              <li key={o.anahtar}>
                <a href={kuralBagi(o.kural)} className="kz-mono">
                  {doldur(tr.denetleyici.bulgular.kural, { kural: o.kural })}
                </a>{' '}
                {olcumMetni(o.anahtar, o.deger)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {sonuc.tekrar.length > 0 ? (
        <>
          <h4>{t.tekrar.baslik}</h4>
          <Tablo
            baslik={t.tekrar.baslik}
            satirAnahtari={(s) => s.ifade}
            sutunlar={[
              { anahtar: 'ifade', baslik: t.tekrar.ifade, hucre: (s) => s.ifade },
              { anahtar: 'adet', baslik: t.tekrar.adet, hucre: (s) => sayiTr(s.adet), sayisal: true },
            ]}
            satirlar={sonuc.tekrar}
            not={t.tekrar.not}
          />
        </>
      ) : null}

      <h4>{t.bulgular.baslik}</h4>
      <div className={styles.filtre}>
        <label htmlFor="tespit-filtre">{t.bulgular.filtre}</label>
        <select
          id="tespit-filtre"
          value={filtre}
          onChange={(e) => {
            setFiltre(e.target.value as Filtre);
            setHepsi(false);
          }}
        >
          <option value="tum">{t.bulgular.filtreTum}</option>
          <option value="kesin">{t.bulgular.filtreKesin}</option>
          <option value="kesinOlasi">{t.bulgular.filtreKesinOlasi}</option>
        </select>
      </div>
      <p className={styles.not}>{doldur(t.bulgular.sonuc, { sayi: sayiTr(gorunen.length) })}</p>
      {iz === 0 && sonuc.say.bilgi === 0 ? <p>{t.bulgular.bos}</p> : null}
      <ol className={styles.bulgular}>
        {listelenen.map((b) => (
          <li key={b.sira} className={styles.bulgu} data-siddet={b.siddet}>
            <p className={styles.bulguUst}>
              <a href={kuralBagi(b.kural)} className={`kz-mono ${styles.kuralBagi}`}>
                {doldur(t.bulgular.kural, { kural: b.kural })}
              </a>
              <span className={styles.siddet} data-siddet={b.siddet}>
                {t.sonuc[b.siddet]}
              </span>
              <span>{t.tur[b.aile]}</span>
              <span className={styles.konum}>
                {b.aralik
                  ? t.bulgular.aralik
                  : doldur(t.bulgular.konum, { satir: sayiTr(b.satir), sutun: sayiTr(b.sutun) })}
              </span>
            </p>
            <p className={styles.alinti}>
              {b.once ? `…${b.once}` : ''}
              <mark data-siddet={b.siddet}>{b.parca}</mark>
              {b.sonra ? `${b.sonra}…` : ''}
            </p>
            {kuralOzetleri[b.kural] ? <p className={styles.kuralOzet}>{kuralOzetleri[b.kural]}</p> : null}
            {b.aralik ? null : (
              <button type="button" className={styles.baglamaDugmesi} onClick={() => goster(b)}>
                {t.bulgular.metindeGoster}
              </button>
            )}
          </li>
        ))}
      </ol>
      {gorunen.length > listelenen.length ? (
        <div className={styles.dugmeSirasi}>
          <p className={styles.not}>
            {doldur(t.bulgular.kirpildi, {
              toplam: sayiTr(gorunen.length),
              gosterilen: sayiTr(listelenen.length),
            })}
          </p>
          {!hepsi ? (
            <Dugme tur="ikincil" onClick={() => setHepsi(true)}>
              {t.bulgular.tumunuGoster}
            </Dugme>
          ) : null}
        </div>
      ) : null}

      <h4>{t.isaretli.baslik}</h4>
      <p className={styles.not}>{t.isaretli.aciklama}</p>
      <div className={styles.isaretli} role="region" aria-label={t.isaretli.etiket} tabIndex={0}>
        {parcalar.map((p, i) =>
          p.bulgular.length === 0 ? (
            <span key={i}>{p.metin}</span>
          ) : (
            <mark key={i} id={`iz-${i}`} data-siddet={p.siddet}>
              {p.metin}
            </mark>
          ),
        )}
      </div>
    </section>
  );
}

function Sayi({ etiket, deger }: { etiket: string; deger: ReactNode }) {
  return (
    <div className={styles.sayi}>
      <dt>{etiket}</dt>
      <dd>{deger}</dd>
    </div>
  );
}

function olcumMetni(anahtar: OlcumAnahtari, deger: number | null): string {
  switch (anahtar) {
    case 'degiskenlik':
      return doldur(t.olcum.degiskenlik, { deger: sayiTr(deger ?? 0, 2) });
    case 'mektedirDir':
      return doldur(t.olcum.mektedirDir, { deger: yuzde(deger ?? 0) });
    case 'kisaMetin':
      return doldur(t.olcum.kisaMetin, { deger: sayiTr(deger ?? 0) });
    case 'tirnak':
      return t.olcum.tirnak;
    case 'kesme':
      return t.olcum.kesme;
  }
}
