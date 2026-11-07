'use client';

import { useState } from 'react';
import tr from '@kazuist/i18n/tr/yazma.json';
import {
  alanDegistir,
  alanSemalari,
  alanlarOf,
  kagitBoyutlari,
  sayfaNoKonumlari,
  type KuralAnahtari,
  type KuralKaydi,
  type KuralDegerleri,
  type SozcukAraligi,
} from '../_cekirdek/kural-semasi.ts';
import { doldur, sayiCoz, sayiMetni } from './yardimci.ts';
import styles from '../yazma.module.css';

/**
 * The control screen of plan 10.5/3: every rule with its value, its source label ("Kılavuzdan", "Örnek değer",
 * "Elle değiştirildi") and, for guide values, "Alıntıyı göster" with the page and the verbatim excerpt (FR-92).
 */

const t = tr.sablon.adim2;

const gruplar: { anahtar: keyof typeof t.gruplar; alanlar: KuralAnahtari[] }[] = [
  { anahtar: 'sayfa', alanlar: ['institution', 'paper', 'mTop', 'mBottom', 'mLeft', 'mRight'] },
  { anahtar: 'metin', alanlar: ['font', 'size', 'footSize', 'line', 'indent', 'spAfter'] },
  { anahtar: 'baslik', alanlar: ['h1Size', 'h1Upper', 'h2Size', 'h3Size'] },
  { anahtar: 'numara', alanlar: ['pageNum', 'frontRoman'] },
  { anahtar: 'diger', alanlar: ['citation', 'sections', 'notes', 'wordLimit', 'absLimit'] },
];

const sayisal: readonly KuralAnahtari[] = [
  'mTop',
  'mBottom',
  'mLeft',
  'mRight',
  'size',
  'footSize',
  'line',
  'indent',
  'spAfter',
  'h1Size',
  'h2Size',
  'h3Size',
];
const metinAlani: readonly KuralAnahtari[] = ['institution', 'font', 'citation'];
const evetHayir: readonly KuralAnahtari[] = ['h1Upper', 'frontRoman'];
const satirListesi: readonly KuralAnahtari[] = ['sections', 'notes'];
const aralikAlani: readonly KuralAnahtari[] = ['wordLimit', 'absLimit'];

const kaynakSinifi = {
  kilavuz: styles.kaynakKilavuz,
  ornek: styles.kaynakOrnek,
  duzenlendi: styles.kaynakDuzenlendi,
} as const;

function baslangicMetni(k: KuralAnahtari, d: KuralDegerleri): string {
  const v = d[k];
  if (typeof v === 'number') return sayiMetni(v);
  if (Array.isArray(v)) return v.join('\n');
  return typeof v === 'string' ? v : '';
}

export function KuralFormu({ kayit, onChange }: { kayit: KuralKaydi; onChange: (k: KuralKaydi) => void }) {
  const gecerli = new Set<KuralAnahtari>(alanlarOf(kayit.tur));
  const [metinler, setMetinler] = useState<Partial<Record<KuralAnahtari, string>>>({});
  const [aralikMetinleri, setAralikMetinleri] = useState<
    Partial<Record<KuralAnahtari, { min: string; max: string }>>
  >({});
  const [hatalar, setHatalar] = useState<Partial<Record<KuralAnahtari, boolean>>>({});
  const [acik, setAcik] = useState<Partial<Record<KuralAnahtari, boolean>>>({});

  const yaz = <K extends KuralAnahtari>(k: K, v: unknown) => {
    const r = alanSemalari[k].safeParse(v);
    setHatalar((h) => ({ ...h, [k]: !r.success }));
    if (r.success) onChange(alanDegistir(kayit, k, r.data as KuralDegerleri[K]));
  };

  const girdiMetni = (k: KuralAnahtari) => metinler[k] ?? baslangicMetni(k, kayit.degerler);
  const metinDegisti = (k: KuralAnahtari, metin: string) => {
    setMetinler((m) => ({ ...m, [k]: metin }));
    if (sayisal.includes(k)) {
      const n = sayiCoz(metin);
      if (n === null) setHatalar((h) => ({ ...h, [k]: true }));
      else yaz(k, n);
    } else if (satirListesi.includes(k)) {
      yaz(
        k,
        metin
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else yaz(k, metin);
  };
  const aralikDegisti = (k: KuralAnahtari, parca: 'min' | 'max', metin: string) => {
    const onceki = aralikMetinleri[k] ?? aralikBaslangic(k);
    const yeni = { ...onceki, [parca]: metin };
    setAralikMetinleri((m) => ({ ...m, [k]: yeni }));
    const cevir = (s: string) =>
      s.trim() === '' ? null : /^\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN;
    const min = cevir(yeni.min);
    const max = cevir(yeni.max);
    if (Number.isNaN(min) || Number.isNaN(max)) setHatalar((h) => ({ ...h, [k]: true }));
    else yaz(k, { min, max } satisfies SozcukAraligi);
  };
  const aralikBaslangic = (k: KuralAnahtari) => {
    const v = kayit.degerler[k] as SozcukAraligi;
    return { min: v.min === null ? '' : String(v.min), max: v.max === null ? '' : String(v.max) };
  };

  const kaynakEtiketi = (k: KuralAnahtari) => {
    const s = kayit.kaynaklar[k];
    return <span className={`${styles.kaynak} ${kaynakSinifi[s]}`}>{t.kaynak[s]}</span>;
  };

  const alinti = (k: KuralAnahtari) => {
    const kanit = kayit.kanitlar[k];
    if (kayit.kaynaklar[k] !== 'kilavuz' || !kanit) return null;
    const id = `alinti-${k}`;
    return (
      <>
        <button
          type="button"
          className={styles.linkDugme}
          aria-expanded={!!acik[k]}
          aria-controls={id}
          onClick={() => setAcik((a) => ({ ...a, [k]: !a[k] }))}
        >
          {acik[k] ? t.alintiGizle : t.alintiGoster}
        </button>
        <blockquote id={id} className={styles.alinti} hidden={!acik[k]}>
          <p>{kanit.alinti}</p>
          <cite>
            {t.alintiBaslik}:{' '}
            {kanit.sayfa === null ? t.alintiSayfaYok : doldur(t.alintiSayfa, { sayfa: kanit.sayfa })}
          </cite>
        </blockquote>
      </>
    );
  };

  const hataMetni = (k: KuralAnahtari) => (
    <p className="kz-alan__hata" id={`kural-${k}-hata`} aria-live="polite">
      {hatalar[k] ? t.gecersiz : ''}
    </p>
  );
  const aciklama = (k: KuralAnahtari) => (hatalar[k] ? `kural-${k}-hata` : undefined);

  const alanCiz = (k: KuralAnahtari) => {
    const etiket = t.alanlar[k];
    const id = `kural-${k}`;
    const ust = (
      <div className={styles.alanUst}>
        <label htmlFor={id}>{etiket}</label>
        {kaynakEtiketi(k)}
      </div>
    );
    if (aralikAlani.includes(k)) {
      const a = aralikMetinleri[k] ?? aralikBaslangic(k);
      return (
        <fieldset key={k} className={`${styles.alan} ${styles.grup}`} style={{ margin: 0 }}>
          <legend className={styles.alanUst}>
            <span>{etiket}</span> {kaynakEtiketi(k)}
          </legend>
          <div className={styles.aralik}>
            <div>
              <label htmlFor={`${id}-min`}>{t.enAz}</label>
              <input
                id={`${id}-min`}
                className="kz-alan__girdi"
                type="text"
                inputMode="numeric"
                value={a.min}
                aria-invalid={hatalar[k] || undefined}
                aria-describedby={aciklama(k)}
                onChange={(e) => aralikDegisti(k, 'min', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${id}-max`}>{t.enCok}</label>
              <input
                id={`${id}-max`}
                className="kz-alan__girdi"
                type="text"
                inputMode="numeric"
                value={a.max}
                aria-invalid={hatalar[k] || undefined}
                aria-describedby={aciklama(k)}
                onChange={(e) => aralikDegisti(k, 'max', e.target.value)}
              />
            </div>
          </div>
          {hataMetni(k)}
          {alinti(k)}
        </fieldset>
      );
    }
    if (satirListesi.includes(k)) {
      return (
        <div key={k} className={`${styles.alan} ${styles.alanTam}`}>
          {ust}
          <p className="kz-alan__ipucu">{k === 'sections' ? t.bolumSirasi : t.notlar}</p>
          <textarea
            id={id}
            className="kz-alan__girdi"
            value={girdiMetni(k)}
            aria-invalid={hatalar[k] || undefined}
            aria-describedby={aciklama(k)}
            onChange={(e) => metinDegisti(k, e.target.value)}
          />
          {hataMetni(k)}
          {alinti(k)}
        </div>
      );
    }
    let girdi;
    if (k === 'paper') {
      girdi = (
        <select
          id={id}
          className="kz-alan__girdi"
          value={kayit.degerler.paper}
          onChange={(e) => yaz(k, e.target.value)}
        >
          {kagitBoyutlari.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      );
    } else if (k === 'pageNum') {
      girdi = (
        <select
          id={id}
          className="kz-alan__girdi"
          value={kayit.degerler.pageNum}
          onChange={(e) => yaz(k, e.target.value)}
        >
          {sayfaNoKonumlari.map((b) => (
            <option key={b} value={b}>
              {t.sayfaNo[b]}
            </option>
          ))}
        </select>
      );
    } else if (evetHayir.includes(k)) {
      girdi = (
        <select
          id={id}
          className="kz-alan__girdi"
          value={String(kayit.degerler[k])}
          onChange={(e) => yaz(k, e.target.value === 'true')}
        >
          <option value="true">{t.evet}</option>
          <option value="false">{t.hayir}</option>
        </select>
      );
    } else {
      girdi = (
        <input
          id={id}
          className="kz-alan__girdi"
          type="text"
          inputMode={sayisal.includes(k) ? 'decimal' : undefined}
          value={girdiMetni(k)}
          aria-invalid={hatalar[k] || undefined}
          aria-describedby={aciklama(k)}
          onChange={(e) => metinDegisti(k, e.target.value)}
        />
      );
    }
    return (
      <div key={k} className={styles.alan}>
        {ust}
        {girdi}
        {metinAlani.includes(k) || sayisal.includes(k) ? hataMetni(k) : null}
        {alinti(k)}
      </div>
    );
  };

  return (
    <div>
      {gruplar.map((g) => {
        const alanlar = g.alanlar.filter((k) => gecerli.has(k));
        if (!alanlar.length) return null;
        return (
          <fieldset key={g.anahtar} className={styles.grup}>
            <legend>{t.gruplar[g.anahtar]}</legend>
            <div className={styles.alanlar}>{alanlar.map(alanCiz)}</div>
          </fieldset>
        );
      })}
    </div>
  );
}
