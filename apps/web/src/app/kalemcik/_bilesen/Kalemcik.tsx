'use client';

import { useCallback, useEffect, useState } from 'react';
import tr from '@kazuist/i18n/tr/kalemcik.json';
import { Dugme, HalkaGrafik } from '@kazuist/ui';
import { doldur, hataMesaji } from '../../yazma/_bilesen/yardimci.ts';
import {
  bugunIstanbul,
  gunAdi,
  kelimedenSayfa,
  mesajSec,
  ozetle,
  sayfadanKelime,
  tonlar,
  VARSAYILAN_SAYFA_KELIME,
  type Hitap,
  type Ozet,
  type Ton,
} from '../_cekirdek/ozet.ts';
import { KalemcikYuzu, type Yuz } from './KalemcikYuzu.tsx';
import { SakinKoc } from './SakinKoc.tsx';
import styles from '../kalemcik.module.css';

interface Proje {
  id: string;
  title: string;
  kind: string;
  targetWords: number;
  deadline: string | null;
  currentWords: number;
}
interface Detay extends Proje {
  createdOn: string;
  recentLogs: { loggedOn: string; words: number }[];
}

const sayi = (n: number) => new Intl.NumberFormat('tr-TR').format(n);
const api = (yol: string, init: RequestInit = {}) =>
  fetch(`/api/v1/writing-projects${yol}`, { credentials: 'same-origin', ...init });
const json = (govde: unknown): RequestInit => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(govde),
});
const tonSinifi: Record<string, string> = {
  yesil: styles.kocYesil ?? '',
  turuncu: styles.kocTuruncu ?? '',
  pembe: styles.kocPembe ?? '',
  kutlama: styles.kocKutlama ?? '',
};

/** Kalemcik: the writing coach (SRS FR-45..56). Everything is the signed in user's; nothing is guessed offline. */
export function Kalemcik() {
  const [yuklendi, setYuklendi] = useState(false);
  const [girisGerek, setGirisGerek] = useState(false);
  const [projeler, setProjeler] = useState<Proje[]>([]);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [detay, setDetay] = useState<Detay | null>(null);
  const [hitap, setHitap] = useState<Hitap>('sen');
  const [mesaj, setMesaj] = useState('');
  const [hata, setHata] = useState('');
  const [onizleme, setOnizleme] = useState(false);

  const detayYukle = useCallback(async (id: string) => {
    const r = await api(`/${id}`);
    if (r.ok) setDetay((await r.json()) as Detay);
  }, []);

  const listeYukle = useCallback(
    async (sec?: string) => {
      const r = await api('');
      if (r.status === 401) {
        setGirisGerek(true);
        setYuklendi(true);
        return;
      }
      if (!r.ok) {
        setHata(await hataMesaji(r, tr.hata.genel));
        setYuklendi(true);
        return;
      }
      const liste = (await r.json()) as Proje[];
      setProjeler(liste);
      const hedef = sec ?? liste[0]?.id ?? null;
      setSeciliId(hedef);
      if (hedef) await detayYukle(hedef);
      else setDetay(null);
      setYuklendi(true);
    },
    [detayYukle],
  );

  useEffect(() => {
    let iptal = false;
    void (async () => {
      const a = await api('/ayarlar');
      if (a.ok && !iptal) setHitap(((await a.json()) as { hitap: Hitap }).hitap);
      if (!iptal) await listeYukle();
    })();
    return () => {
      iptal = true;
    };
  }, [listeYukle]);

  const bugun = bugunIstanbul();
  const ozet: Ozet | null = detay ? ozetle(detay, bugun) : null;

  // ---- new project ----
  const [ad, setAd] = useState('');
  const [tur, setTur] = useState<'makale' | 'tez' | 'odev'>('makale');
  const [kelime, setKelime] = useState('');
  const [sayfa, setSayfa] = useState('');
  const [teslim, setTeslim] = useState('');
  const [formHata, setFormHata] = useState('');

  const kelimeDegisti = (v: string) => {
    setKelime(v);
    const n = Number(v);
    setSayfa(v && Number.isFinite(n) ? String(kelimedenSayfa(n)).replace('.', ',') : '');
  };
  const sayfaDegisti = (v: string) => {
    setSayfa(v);
    const n = Number(v.replace(',', '.'));
    setKelime(v && Number.isFinite(n) ? String(sayfadanKelime(n)) : '');
  };

  async function projeEkle(e: React.FormEvent) {
    e.preventDefault();
    setFormHata('');
    setMesaj('');
    const hedef = Number(kelime);
    const r = await api('', {
      method: 'POST',
      ...json({
        title: ad.trim(),
        kind: tur,
        targetWords: Number.isInteger(hedef) ? hedef : -1,
        ...(teslim ? { deadline: teslim } : {}),
      }),
    });
    if (r.status === 401) {
      setGirisGerek(true);
      return;
    }
    if (!r.ok) {
      setFormHata(tr.form.hata);
      return;
    }
    const yeni = (await r.json()) as Proje;
    setAd('');
    setKelime('');
    setSayfa('');
    setTeslim('');
    setMesaj(tr.form.eklendi);
    await listeYukle(yeni.id);
  }

  async function projeSil() {
    if (!seciliId || !window.confirm(tr.projeler.silOnay)) return;
    const r = await api(`/${seciliId}`, { method: 'DELETE' });
    if (r.status === 204) {
      setMesaj(tr.projeler.silindi);
      await listeYukle();
    }
  }

  // ---- daily record ----
  const [bugunKelime, setBugunKelime] = useState('');
  async function kayitEkle(e: React.FormEvent) {
    e.preventDefault();
    if (!seciliId) return;
    const n = Number(bugunKelime);
    if (!Number.isInteger(n) || n < 0 || n > 100_000) {
      setHata(tr.kayit.hata);
      return;
    }
    setHata('');
    const r = await api(`/${seciliId}/progress`, { method: 'POST', ...json({ words: n }) });
    if (!r.ok) {
      setHata(tr.kayit.hata);
      return;
    }
    setBugunKelime('');
    setMesaj(tr.kayit.eklendi);
    await listeYukle(seciliId);
  }

  // ---- docx count ----
  const [dosya, setDosya] = useState<File | null>(null);
  const [sayim, setSayim] = useState<{ words: number; footnoteWords: number } | null>(null);
  const [sayimHata, setSayimHata] = useState('');
  async function docxSay() {
    if (!seciliId || !dosya) return;
    setSayimHata('');
    setSayim(null);
    const f = new FormData();
    f.set('file', dosya);
    const r = await api(`/${seciliId}/docx-count`, { method: 'POST', body: f });
    if (!r.ok) {
      setSayimHata(await hataMesaji(r, tr.kayit.docx.hata));
      return;
    }
    setSayim((await r.json()) as { words: number; footnoteWords: number });
  }
  const fark = sayim && detay ? Math.max(0, sayim.words - detay.currentWords) : 0;
  async function farkiEkle() {
    if (!seciliId || fark <= 0) return;
    const r = await api(`/${seciliId}/progress`, { method: 'POST', ...json({ words: fark, note: 'docx' }) });
    if (r.ok) {
      setSayim(null);
      setMesaj(tr.kayit.eklendi);
      await listeYukle(seciliId);
    }
  }

  async function hitapKaydet(h: Hitap) {
    setHitap(h);
    const r = await api('/ayarlar', { method: 'PUT', ...json({ hitap: h }) });
    if (r.ok) setMesaj(tr.ayarlar.kaydedildi);
  }

  if (!yuklendi) return <SakinKoc yukleniyor />;
  if (girisGerek)
    return (
      <p className={`${styles.kutu} ${styles.uyari}`}>
        {tr.girisGerek.metin} <a href="/giris">{tr.girisGerek.baglanti}</a>
      </p>
    );

  const ton: Ton = ozet?.ton ?? 'iyi';
  const bilgi = tonlar[ton];
  const tohum = Number(bugun.replaceAll('-', ''));
  const calisma = detay?.title ?? '';
  const kocMesaji = ozet ? mesajSec(ton, hitap, ozet, calisma, tohum) : '';
  const onizlemeOzet: Ozet | null = ozet ? { ...ozet, sessizGun: 3, ton: 'yazilmadi' } : null;
  const yuzAdi = bilgi.yuz as Yuz;

  return (
    <div className={styles.duzen}>
      <p className={styles.durum} role="status" aria-live="polite">
        {mesaj}
      </p>
      {hata ? (
        <p className={`${styles.kutu} ${styles.hata}`} role="alert">
          {hata}
        </p>
      ) : null}

      <section className={styles.bolum} aria-labelledby="k-projeler">
        <h2 id="k-projeler">{tr.projeler.baslik}</h2>
        {projeler.length ? (
          <ul className={styles.liste} role="list">
            {projeler.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={styles.projeDugme}
                  aria-pressed={p.id === seciliId}
                  onClick={() => {
                    setSeciliId(p.id);
                    void detayYukle(p.id);
                  }}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.okuma}>{tr.projeler.bos}</p>
        )}
      </section>

      {detay && ozet ? (
        <>
          <section className={styles.bolum} aria-labelledby="k-koc">
            <h2 id="k-koc">{tr.kalemcik.ad}</h2>
            <div className={`${styles.koc} ${tonSinifi[bilgi.renk] ?? ''}`}>
              <KalemcikYuzu yuz={yuzAdi} />
              <div>
                <p className={styles.kocTon}>{tr.kalemcik.ton[ton]}</p>
                <p className={styles.kocMesaj}>{kocMesaji}</p>
              </div>
            </div>
            <div className={styles.eylemler}>
              <Dugme tur="sessiz" onClick={() => setOnizleme((o) => !o)} aria-expanded={onizleme}>
                {onizleme ? tr.kalemcik.onizleme.kapat : tr.kalemcik.onizleme.uc}
              </Dugme>
            </div>
            {onizleme && onizlemeOzet ? (
              <div className={styles.koc} style={{ marginTop: 'var(--kz-space-3)' }}>
                <KalemcikYuzu yuz="uzgun" boyut={72} />
                <div>
                  <p className={styles.kocTon}>{tr.kalemcik.ton.yazilmadi}</p>
                  <p className={styles.kocMesaj}>
                    {mesajSec('yazilmadi', hitap, onizlemeOzet, calisma, tohum)}
                  </p>
                </div>
              </div>
            ) : null}
            {ton === 'hedef' ? (
              <div className={styles.kutu} style={{ marginTop: 'var(--kz-space-3)' }}>
                <p>
                  <strong>{tr.hedef.baslik}.</strong> {tr.hedef.aciklama}
                </p>
                <p>
                  <a href="/rehberler">{tr.hedef.kontrol}</a> · <a href="/tespit">{tr.hedef.tespit}</a>
                </p>
              </div>
            ) : null}
          </section>

          <section className={styles.bolum} aria-labelledby="k-ilerleme">
            <h2 id="k-ilerleme">{detay.title}</h2>
            <div className={styles.ilerleme}>
              <HalkaGrafik
                deger={ozet.yazilan}
                azami={detay.targetWords}
                etiket={tr.halka.etiket}
                degerMetni={doldur(tr.halka.deger, {
                  yazilan: sayi(ozet.yazilan),
                  hedef: sayi(detay.targetWords),
                  sayfa: String(kelimedenSayfa(ozet.yazilan)).replace('.', ','),
                  hedefSayfa: String(kelimedenSayfa(detay.targetWords)).replace('.', ','),
                })}
                boyut={160}
              />
              <dl className={styles.ozet}>
                <div className={styles.sayi}>
                  <dt>{tr.ozet.yazilan}</dt>
                  <dd>{doldur(tr.ozet.kelime, { n: sayi(ozet.yazilan) })}</dd>
                </div>
                <div className={styles.sayi}>
                  <dt>{tr.ozet.kalan}</dt>
                  <dd>{doldur(tr.ozet.kelime, { n: sayi(ozet.kalan) })}</dd>
                </div>
                <div className={styles.sayi}>
                  <dt>{tr.ozet.kalanGun}</dt>
                  <dd>
                    {ozet.kalanGun === null
                      ? tr.ozet.teslimYok
                      : ozet.kalanGun < 0
                        ? tr.ozet.teslimGecti
                        : doldur(tr.ozet.gun, { n: ozet.kalanGun })}
                  </dd>
                </div>
                <div className={styles.sayi}>
                  <dt>{tr.ozet.gunluk}</dt>
                  <dd>
                    {ozet.kalanGun === null || ozet.kalanGun < 0
                      ? '–'
                      : doldur(tr.ozet.kelime, { n: sayi(ozet.gunluk) })}
                  </dd>
                </div>
              </dl>
            </div>
            <h3>{tr.takvim.baslik}</h3>
            <ol className={styles.takvim} role="list">
              {ozet.takvim.map((g) => (
                <li key={g.gun} className={styles.gun}>
                  <span>{gunAdi(g.gun)}</span>
                  <span
                    className={`${styles.daire} ${g.yazildi ? styles.daireDolu : ''}`}
                    aria-hidden="true"
                  />
                  <span className={styles.gizli}>
                    {g.yazildi
                      ? doldur(tr.takvim.yazildi, { gun: gunAdi(g.gun), kelime: sayi(g.kelime) })
                      : doldur(tr.takvim.yazilmadi, { gun: gunAdi(g.gun) })}
                  </span>
                </li>
              ))}
            </ol>
            <div className={styles.eylemler}>
              <Dugme tur="ikincil" onClick={projeSil}>
                {tr.projeler.sil}
              </Dugme>
            </div>
          </section>

          <section className={styles.bolum} aria-labelledby="k-kayit">
            <h2 id="k-kayit">{tr.kayit.baslik}</h2>
            <form className={styles.form} onSubmit={kayitEkle}>
              <div className="kz-alan">
                <label className="kz-alan__etiket" htmlFor="k-bugun">
                  {tr.kayit.kelime}
                </label>
                <input
                  id="k-bugun"
                  className="kz-alan__girdi"
                  type="text"
                  inputMode="numeric"
                  value={bugunKelime}
                  onChange={(e) => setBugunKelime(e.target.value)}
                />
              </div>
              <div className={styles.eylemler} style={{ marginTop: 0 }}>
                <Dugme type="submit">{tr.kayit.ekle}</Dugme>
              </div>
            </form>
            <h3>{tr.kayit.docx.baslik}</h3>
            <p className={styles.ipucu}>{tr.kayit.docx.aciklama}</p>
            <div className="kz-alan">
              <label className="kz-alan__etiket" htmlFor="k-docx">
                {tr.kayit.docx.dosya}
              </label>
              <input
                id="k-docx"
                className="kz-alan__girdi"
                type="file"
                accept=".docx"
                onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className={styles.eylemler}>
              <Dugme tur="ikincil" onClick={docxSay} disabled={!dosya}>
                {tr.kayit.docx.say}
              </Dugme>
            </div>
            {sayimHata ? (
              <p className={`${styles.kutu} ${styles.hata}`} role="alert">
                {sayimHata}
              </p>
            ) : null}
            {sayim ? (
              <div className={styles.kutu} role="status">
                <p>
                  {doldur(tr.kayit.docx.sonuc, {
                    kelime: sayi(sayim.words),
                    dipnot: sayi(sayim.footnoteWords),
                    kayitli: sayi(detay.currentWords),
                  })}
                </p>
                <p>{fark > 0 ? doldur(tr.kayit.docx.fark, { fark: sayi(fark) }) : tr.kayit.docx.farkYok}</p>
                {fark > 0 ? (
                  <div className={styles.eylemler}>
                    <Dugme onClick={farkiEkle}>{tr.kayit.docx.uygula}</Dugme>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <SakinKoc />
      )}

      <section className={styles.bolum} aria-labelledby="k-yeni">
        <h2 id="k-yeni">{tr.form.baslik}</h2>
        <form className={styles.form} onSubmit={projeEkle}>
          <div className="kz-alan">
            <label className="kz-alan__etiket" htmlFor="k-ad">
              {tr.form.ad}
            </label>
            <p className="kz-alan__ipucu">{tr.form.adIpucu}</p>
            <input
              id="k-ad"
              className="kz-alan__girdi"
              type="text"
              required
              maxLength={300}
              value={ad}
              onChange={(e) => setAd(e.target.value)}
            />
          </div>
          <div className="kz-alan">
            <label className="kz-alan__etiket" htmlFor="k-tur">
              {tr.form.tur}
            </label>
            <select
              id="k-tur"
              className="kz-alan__girdi"
              value={tur}
              onChange={(e) => setTur(e.target.value as typeof tur)}
            >
              {(['makale', 'tez', 'odev'] as const).map((s) => (
                <option key={s} value={s}>
                  {tr.form.turler[s]}
                </option>
              ))}
            </select>
          </div>
          <p className={styles.ipucu}>{doldur(tr.form.sayfaIpucu, { katsayi: VARSAYILAN_SAYFA_KELIME })}</p>
          <div className={styles.ikili}>
            <div className="kz-alan">
              <label className="kz-alan__etiket" htmlFor="k-kelime">
                {tr.form.hedefKelime}
              </label>
              <input
                id="k-kelime"
                className="kz-alan__girdi"
                type="text"
                inputMode="numeric"
                required
                value={kelime}
                onChange={(e) => kelimeDegisti(e.target.value)}
              />
            </div>
            <div className="kz-alan">
              <label className="kz-alan__etiket" htmlFor="k-sayfa">
                {tr.form.hedefSayfa}
              </label>
              <input
                id="k-sayfa"
                className="kz-alan__girdi"
                type="text"
                inputMode="decimal"
                value={sayfa}
                onChange={(e) => sayfaDegisti(e.target.value)}
              />
            </div>
          </div>
          <div className="kz-alan">
            <label className="kz-alan__etiket" htmlFor="k-teslim">
              {tr.form.teslim}
            </label>
            <input
              id="k-teslim"
              className="kz-alan__girdi"
              type="date"
              value={teslim}
              onChange={(e) => setTeslim(e.target.value)}
            />
          </div>
          {formHata ? (
            <p className={`${styles.kutu} ${styles.hata}`} role="alert">
              {formHata}
            </p>
          ) : null}
          <div className={styles.eylemler} style={{ marginTop: 0 }}>
            <Dugme type="submit">{tr.form.ekle}</Dugme>
          </div>
        </form>
      </section>

      <section className={styles.bolum} aria-labelledby="k-ayar">
        <h2 id="k-ayar">{tr.ayarlar.baslik}</h2>
        <fieldset className={styles.secenekler}>
          <legend>{tr.ayarlar.hitap}</legend>
          {(['sen', 'siz'] as const).map((h) => (
            <label key={h} className={styles.secenek}>
              <input type="radio" name="hitap" checked={hitap === h} onChange={() => void hitapKaydet(h)} />
              <span>{tr.ayarlar[h]}</span>
            </label>
          ))}
        </fieldset>
        <p className={styles.ipucu}>{tr.ayarlar.kanallar}</p>
        <p className={styles.ipucu}>
          {tr.ayarlar.tercihler} <a href="/hesap">{tr.ayarlar.tercihBaglantisi}</a>
        </p>
      </section>
    </div>
  );
}
