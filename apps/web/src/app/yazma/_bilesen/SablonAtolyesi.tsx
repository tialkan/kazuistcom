'use client';

import { useEffect, useRef, useState } from 'react';
import tr from '@kazuist/i18n/tr/yazma.json';
import { Dugme } from '@kazuist/ui';
import { sablonDosyaAdi } from '../_cekirdek/dosya-adi.ts';
import {
  degerleriDogrula,
  kuralAnahtarlari,
  ornekKayit,
  type KuralAnahtari,
  type KuralKaydi,
  type Kanit,
  type Kaynak,
  type SablonTuru,
} from '../_cekirdek/kural-semasi.ts';
import { Denetim } from './Denetim.tsx';
import { KuralFormu } from './KuralFormu.tsx';
import { DOCX_TIPI, doldur, dosyaIndir, hataMesaji } from './yardimci.ts';
import styles from '../yazma.module.css';

const t = tr.sablon;

type Kaynagi = 'ornek' | 'yukle';
interface IsDurumu {
  status: string;
  result: {
    templateRuleId: string | null;
    model: 'haiku' | 'sonnet' | null;
    sonnetYedegi: boolean;
    dusenler: { anahtar: string }[];
    uyarilar: string[];
  } | null;
  error: string | null;
}
interface KuralYaniti {
  id: string;
  tur: SablonTuru;
  degerler: KuralKaydi['degerler'];
  kaynaklar: Record<KuralAnahtari, Kaynak>;
  kanitlar: Partial<Record<KuralAnahtari, Kanit>>;
}

const uyariMetni = (kod: string) =>
  kod === 'taranmis_olabilir' ? tr.hata.taranmisOlabilir : tr.hata.metinAz;
const hataKodlari: Record<string, string> = {
  yz_yok: tr.hata.yzYok,
  sema: tr.hata.sema,
  model: tr.hata.model,
  bos_metin: tr.hata.metinAz,
  cok_buyuk: tr.hata.cokBuyuk,
  bozuk: tr.hata.bozuk,
  sifreli: tr.hata.sifreli,
  zip_bomba: tr.hata.zipBomba,
  zaman_asimi: tr.hata.zamanAsimi,
  cok_sayfa: tr.hata.cokSayfa,
  tur_uyusmuyor: tr.hata.turUyusmuyor,
  tur_desteklenmiyor: tr.hata.turDesteklenmiyor,
  bos: tr.hata.bos,
};

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Template workshop: source of the rules, control screen, download, and the check of a finished file. */
export function SablonAtolyesi({
  baslangicTuru = 'tez',
  baslangicKaydi,
  baslangicAdi,
}: {
  baslangicTuru?: SablonTuru;
  baslangicKaydi?: KuralKaydi;
  baslangicAdi?: string;
}) {
  const [tur, setTur] = useState<SablonTuru>(baslangicKaydi?.tur ?? baslangicTuru);
  const [kayit, setKayit] = useState<KuralKaydi>(() => baslangicKaydi ?? ornekKayit(baslangicTuru));
  const [surum, setSurum] = useState(0);
  const [kaynagi, setKaynagi] = useState<Kaynagi>('ornek');
  const [kurum, setKurum] = useState(baslangicAdi ?? '');
  const [dosya, setDosya] = useState<File | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState('');
  const [hata, setHata] = useState('');
  const [girisGerek, setGirisGerek] = useState(false);
  const [ozet, setOzet] = useState<string[]>([]);
  const [kuralId, setKuralId] = useState<string | null>(null);
  const [indirme, setIndirme] = useState('');
  const [indirmeHata, setIndirmeHata] = useState('');
  const aktif = useRef(true);
  useEffect(() => {
    aktif.current = true;
    return () => {
      aktif.current = false;
    };
  }, []);

  const turDegisti = (yeni: SablonTuru) => {
    setTur(yeni);
    setKayit(ornekKayit(yeni));
    setSurum((s) => s + 1);
    setKuralId(null);
    setOzet([]);
  };

  async function kuralYukle() {
    if (!dosya) return;
    setYukleniyor(true);
    setHata('');
    setMesaj(t.adim1.cikariliyor);
    setOzet([]);
    setGirisGerek(false);
    try {
      const f = new FormData();
      f.set('file', dosya);
      f.set('kind', tur);
      if (kurum.trim()) f.set('institutionName', kurum.trim());
      const r = await fetch('/api/v1/templates/rules', {
        method: 'POST',
        body: f,
        credentials: 'same-origin',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      if (r.status === 401) {
        setGirisGerek(true);
        setMesaj('');
        return;
      }
      if (r.status === 503) throw new Error(t.adim1.yzYok);
      if (r.status !== 202) throw new Error(await hataMesaji(r, tr.hata.genel));
      const { jobId } = (await r.json()) as { jobId: string };
      let durum: IsDurumu | null = null;
      for (let i = 0; i < 120 && aktif.current; i++) {
        await bekle(i < 5 ? 1000 : 2000);
        const jr = await fetch(`/api/v1/jobs/${jobId}`, { credentials: 'same-origin' });
        if (!jr.ok) throw new Error(await hataMesaji(jr, tr.hata.genel));
        durum = (await jr.json()) as IsDurumu;
        if (durum.status === 'done' || durum.status === 'failed' || durum.status === 'dead') break;
      }
      if (!durum || durum.status !== 'done') {
        throw new Error(durum?.error ? (hataKodlari[durum.error] ?? tr.hata.genel) : tr.hata.model);
      }
      const sonuc = durum.result;
      if (!sonuc?.templateRuleId) {
        setMesaj('');
        setHata((sonuc?.uyarilar ?? []).map(uyariMetni).join(' ') || tr.hata.metinAz);
        return;
      }
      const kr = await fetch(`/api/v1/templates/rules/${sonuc.templateRuleId}`, {
        credentials: 'same-origin',
      });
      if (!kr.ok) throw new Error(await hataMesaji(kr, tr.hata.genel));
      const k = (await kr.json()) as KuralYaniti;
      const yeni: KuralKaydi = {
        tur: k.tur,
        degerler: k.degerler,
        kaynaklar: k.kaynaklar,
        kanitlar: k.kanitlar,
      };
      setKayit(yeni);
      setSurum((s) => s + 1);
      setKuralId(k.id);
      const kilavuz = kuralAnahtarlari.filter((a) => yeni.kaynaklar[a] === 'kilavuz').length;
      const satirlar = [
        doldur(t.adim1.ozet, {
          kilavuz,
          ornek: Object.keys(yeni.kaynaklar).length - kilavuz,
          model: sonuc.model === 'sonnet' ? 'Sonnet 5.5' : 'Haiku 5.5',
        }),
      ];
      if (sonuc.sonnetYedegi) satirlar.push(t.adim1.yedekModel);
      if (sonuc.dusenler.length)
        satirlar.push(
          doldur(t.adim1.dusenler, {
            liste: sonuc.dusenler
              .map((d) => tr.sablon.adim2.alanlar[d.anahtar as KuralAnahtari] ?? d.anahtar)
              .join(', '),
          }),
        );
      setOzet(satirlar);
      setMesaj(t.adim1.hazir);
    } catch (e) {
      setMesaj('');
      setHata(e instanceof Error && e.message ? e.message : tr.hata.genel);
    } finally {
      setYukleniyor(false);
    }
  }

  async function kuralSil() {
    if (!kuralId) return;
    const r = await fetch(`/api/v1/templates/rules/${kuralId}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (r.status === 204) {
      setKuralId(null);
      setOzet([]);
      setMesaj(t.adim1.silindi);
      setKayit(ornekKayit(tur));
      setSurum((s) => s + 1);
    }
  }

  async function indir() {
    setIndirmeHata('');
    setIndirme(t.adim3.hazirlaniyor);
    const d = degerleriDogrula(kayit.degerler);
    if (!d.ok) {
      setIndirme('');
      setIndirmeHata(
        doldur(t.adim3.hataliAlanlar, {
          liste: Object.keys(d.hatalar)
            .map((k) => tr.sablon.adim2.alanlar[k as KuralAnahtari])
            .join(', '),
        }),
      );
      return;
    }
    try {
      const { sablonUret } = await import('../_cekirdek/docx-uret.ts');
      const bayt = await sablonUret(d.degerler, kayit.tur);
      const ad = sablonDosyaAdi(
        kayit.tur,
        kurum.trim() || (d.degerler.institution.startsWith('[') ? '' : d.degerler.institution),
      );
      dosyaIndir(bayt, ad, DOCX_TIPI);
      setIndirme(doldur(t.adim3.indirildi, { ad }));
    } catch {
      setIndirme('');
      setIndirmeHata(t.adim3.hata);
    }
  }

  return (
    <div>
      <fieldset className={styles.secenekler}>
        <legend>{t.tur.etiket}</legend>
        {(['tez', 'makale'] as const).map((s) => (
          <label key={s} className={styles.secenek}>
            <input type="radio" name="sablon-turu" checked={tur === s} onChange={() => turDegisti(s)} />
            <span>{t.tur[s]}</span>
          </label>
        ))}
      </fieldset>

      {
        <section className={styles.adim} aria-labelledby="adim1-baslik">
          <h2 id="adim1-baslik">{t.adim1.baslik}</h2>
          <fieldset className={styles.secenekler}>
            <legend className={styles.gizli}>{t.adim1.baslik}</legend>
            <label className={styles.secenek}>
              <input
                type="radio"
                name="kaynak"
                checked={kaynagi === 'ornek'}
                onChange={() => setKaynagi('ornek')}
              />
              <span>
                <strong>{t.adim1.ornek}</strong>
                <br />
                {t.adim1.ornekAciklama}
              </span>
            </label>
            <label className={styles.secenek}>
              <input
                type="radio"
                name="kaynak"
                checked={kaynagi === 'yukle'}
                onChange={() => setKaynagi('yukle')}
              />
              <span>
                <strong>{t.adim1.yukle}</strong>
              </span>
            </label>
          </fieldset>
          {kaynagi === 'yukle' ? (
            <div>
              <p className={styles.kutu}>{t.adim1.gizlilik}</p>
              <div className="kz-alan">
                <label className="kz-alan__etiket" htmlFor="kilavuz-dosya">
                  {t.adim1.dosya}
                </label>
                <p className="kz-alan__ipucu" id="kilavuz-dosya-ipucu">
                  {t.adim1.dosyaIpucu}
                </p>
                <input
                  id="kilavuz-dosya"
                  className="kz-alan__girdi"
                  type="file"
                  accept=".pdf,.docx,.txt"
                  aria-describedby="kilavuz-dosya-ipucu"
                  onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="kz-alan">
                <label className="kz-alan__etiket" htmlFor="kilavuz-kurum">
                  {t.adim1.kurum}
                </label>
                <input
                  id="kilavuz-kurum"
                  className="kz-alan__girdi"
                  type="text"
                  maxLength={200}
                  value={kurum}
                  onChange={(e) => setKurum(e.target.value)}
                />
              </div>
              <div className={styles.eylemler}>
                <Dugme onClick={kuralYukle} disabled={!dosya || yukleniyor}>
                  {t.adim1.cikar}
                </Dugme>
                {kuralId ? (
                  <Dugme tur="ikincil" onClick={kuralSil}>
                    {t.adim1.sil}
                  </Dugme>
                ) : null}
              </div>
            </div>
          ) : null}
          <p className={styles.durum} role="status" aria-live="polite">
            {mesaj}
          </p>
          {girisGerek ? (
            <p className={`${styles.kutu} ${styles.kutuUyari}`}>
              {t.adim1.girisGerek} <a href="/giris">{t.adim1.girisBaglantisi}</a>
            </p>
          ) : null}
          {hata ? (
            <p className={`${styles.kutu} ${styles.kutuHata}`} role="alert">
              {hata}
            </p>
          ) : null}
          {ozet.length ? (
            <div className={styles.kutu}>
              {ozet.map((s) => (
                <p key={s}>{s}</p>
              ))}
            </div>
          ) : null}
        </section>
      }

      <section className={styles.adim} aria-labelledby="adim2-baslik">
        <h2 id="adim2-baslik">{t.adim2.baslik}</h2>
        <p className={styles.okuma}>{t.adim2.aciklama}</p>
        <KuralFormu key={`${tur}-${surum}`} kayit={kayit} onChange={setKayit} />
      </section>

      <section className={styles.adim} aria-labelledby="adim3-baslik">
        <h2 id="adim3-baslik">{t.adim3.baslik}</h2>
        <p className={styles.okuma}>{t.adim3.ipucu}</p>
        <p className={styles.not}>{t.adim3.tarayici}</p>
        <div className={styles.eylemler}>
          <Dugme onClick={indir}>{t.adim3.indir}</Dugme>
        </div>
        <p className={styles.durum} role="status" aria-live="polite">
          {indirme}
        </p>
        {indirmeHata ? (
          <p className={`${styles.kutu} ${styles.kutuHata}`} role="alert">
            {indirmeHata}
          </p>
        ) : null}
      </section>

      <Denetim kayit={kayit} />
    </div>
  );
}
