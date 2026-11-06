'use client';

import { useState } from 'react';
import tr from '@kazuist/i18n/tr/yazma.json';
import { Dugme } from '@kazuist/ui';
import { kopyalanabilirMetin, sirala, type KisaltmaKaynagi } from '../_cekirdek/kisaltmalar.ts';
import { metinCikar, YuklemeHatasi } from '../_cekirdek/metin-cikarma.ts';
import { DOCX_TIPI, doldur, dosyaIndir, hataMesaji } from './yardimci.ts';
import styles from '../yazma.module.css';

const t = tr.sablon.kisaltma;

interface Satir {
  kisa: string;
  uzun: string;
  kaynak: KisaltmaKaynagi;
  sayi: number;
  kullan: boolean;
}

const yuklemeHatasiMetni: Record<string, string> = {
  bos: tr.hata.bos,
  cok_buyuk: tr.hata.cokBuyuk,
  tur_desteklenmiyor: tr.hata.turDesteklenmiyor,
  tur_uyusmuyor: tr.hata.turUyusmuyor,
  bozuk: tr.hata.bozuk,
  sifreli: tr.hata.sifreli,
  zip_bomba: tr.hata.zipBomba,
  zaman_asimi: tr.hata.zamanAsimi,
  cok_sayfa: tr.hata.cokSayfa,
};

/** Table of abbreviations (FR-91). The file is read in the browser; the server only sees the extracted text. */
export function KisaltmaAraci() {
  const [dosya, setDosya] = useState<File | null>(null);
  const [yapayZeka, setYapayZeka] = useState(false);
  const [calisiyor, setCalisiyor] = useState(false);
  const [satirlar, setSatirlar] = useState<Satir[] | null>(null);
  const [mesaj, setMesaj] = useState('');
  const [hata, setHata] = useState('');
  const [girisGerek, setGirisGerek] = useState(false);
  const [kopya, setKopya] = useState('');

  async function bul() {
    if (!dosya) return;
    setCalisiyor(true);
    setHata('');
    setMesaj(t.bulunuyor);
    setSatirlar(null);
    setKopya('');
    setGirisGerek(false);
    try {
      const ad = dosya.name.toLowerCase();
      if (!ad.endsWith('.docx') && !ad.endsWith('.txt')) throw new YuklemeHatasi('tur_desteklenmiyor');
      const cikan = await metinCikar(new Uint8Array(await dosya.arrayBuffer()), dosya.name);
      const metin = cikan.sayfalar
        .map((s) => s.metin)
        .join('\n')
        .slice(0, 200_000);
      const r = await fetch('/api/v1/abbreviations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: metin, useAi: yapayZeka }),
      });
      if (r.status === 401) {
        setGirisGerek(true);
        setMesaj('');
        return;
      }
      if (!r.ok) throw new Error(await hataMesaji(r, tr.hata.genel));
      const liste = (await r.json()) as {
        short: string;
        long: string;
        source: KisaltmaKaynagi;
        count: number;
      }[];
      setSatirlar(
        sirala(
          liste.map((x) => ({
            kisa: x.short,
            uzun: x.long,
            kaynak: x.source,
            sayi: x.count,
            kullan: x.long.trim() !== '' && x.source !== 'oneri',
          })),
        ),
      );
      setMesaj(liste.length ? doldur(t.sonuc, { adet: liste.length }) : t.bosSonuc);
      if (yapayZeka && r.headers.get('x-yazma-oneri') === 'kapali') setHata(t.oneriYok);
    } catch (e) {
      setMesaj('');
      setHata(
        e instanceof YuklemeHatasi
          ? (yuklemeHatasiMetni[e.kod] ?? tr.hata.genel)
          : e instanceof Error && e.message
            ? e.message
            : tr.hata.genel,
      );
    } finally {
      setCalisiyor(false);
    }
  }

  const sec = (kisa: string, parca: Partial<Satir>) =>
    setSatirlar((s) => (s ? s.map((x) => (x.kisa === kisa ? { ...x, ...parca } : x)) : s));
  const secili = (satirlar ?? []).filter((s) => s.kullan && s.uzun.trim());

  async function panoyaKopyala() {
    const metin = kopyalanabilirMetin(secili);
    try {
      await navigator.clipboard.writeText(metin);
      setMesaj(t.kopyalandi);
      setKopya('');
    } catch {
      setKopya(metin);
      setMesaj(t.kopyalanamadi);
    }
  }

  async function docxIndir() {
    const { cetvelDocx } = await import('../_cekirdek/kisaltmalar.ts');
    const bayt = await cetvelDocx(secili);
    const ad = 'Kisaltmalar_Cetveli.docx';
    dosyaIndir(bayt, ad, DOCX_TIPI);
    setMesaj(doldur(t.docxIndirildi, { ad }));
  }

  return (
    <div>
      <p className={styles.okuma}>{t.aciklama}</p>
      <div className="kz-alan">
        <label className="kz-alan__etiket" htmlFor="kisaltma-dosya">
          {t.dosya}
        </label>
        <input
          id="kisaltma-dosya"
          className="kz-alan__girdi"
          type="file"
          accept=".docx,.txt"
          onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
        />
      </div>
      <label className={styles.secenek}>
        <input type="checkbox" checked={yapayZeka} onChange={(e) => setYapayZeka(e.target.checked)} />
        <span>{t.yapayZeka}</span>
      </label>
      <div className={styles.eylemler}>
        <Dugme onClick={bul} disabled={!dosya || calisiyor}>
          {t.bul}
        </Dugme>
      </div>
      <p className={styles.durum} role="status" aria-live="polite">
        {mesaj}
      </p>
      {girisGerek ? (
        <p className={`${styles.kutu} ${styles.kutuUyari}`}>
          {t.girisGerek} <a href="/giris">{tr.sablon.adim1.girisBaglantisi}</a>
        </p>
      ) : null}
      {hata ? (
        <p className={`${styles.kutu} ${styles.kutuUyari}`} role="alert">
          {hata}
        </p>
      ) : null}
      {satirlar?.length ? (
        <div>
          <div className={`kz-tablo ${styles.tabloDuzen}`} role="region" aria-label={t.tablo} tabIndex={0}>
            <table>
              <caption>{t.tablo}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.kullan}</th>
                  <th scope="col">{t.kisa}</th>
                  <th scope="col">{t.uzun}</th>
                  <th scope="col">{t.kaynak}</th>
                  <th scope="col" className="kz-sayisal">
                    {t.sayi}
                  </th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s) => (
                  <tr key={s.kisa}>
                    <td>
                      <input
                        type="checkbox"
                        checked={s.kullan}
                        aria-label={`${t.kullan}: ${s.kisa}`}
                        onChange={(e) => sec(s.kisa, { kullan: e.target.checked })}
                      />
                    </td>
                    <th scope="row">{s.kisa}</th>
                    <td>
                      <input
                        type="text"
                        className="kz-alan__girdi"
                        value={s.uzun}
                        maxLength={120}
                        aria-label={`${t.uzun}: ${s.kisa}`}
                        onChange={(e) =>
                          sec(s.kisa, { uzun: e.target.value, kullan: e.target.value.trim() !== '' })
                        }
                      />
                    </td>
                    <td>{t.kaynaklar[s.kaynak]}</td>
                    <td className="kz-sayisal">{s.sayi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.eylemler}>
            <Dugme onClick={docxIndir} disabled={!secili.length}>
              {t.docx}
            </Dugme>
            <Dugme tur="ikincil" onClick={panoyaKopyala} disabled={!secili.length}>
              {t.kopyala}
            </Dugme>
          </div>
          {kopya ? (
            <div className={`kz-alan ${styles.kopyaAlani}`}>
              <label className="kz-alan__etiket" htmlFor="kisaltma-kopya">
                {t.kopyaAlani}
              </label>
              <textarea
                id="kisaltma-kopya"
                className="kz-alan__girdi"
                readOnly
                value={kopya}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
