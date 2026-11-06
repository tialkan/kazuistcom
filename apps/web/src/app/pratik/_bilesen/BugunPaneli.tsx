'use client';

import { useId, useState } from 'react';
import { ayarlaDepo, calismaKuyrugu } from '../_alan/depo.ts';
import { doldur, tr } from './metin.ts';
import { useDepo } from './useDepo.ts';
import styles from '../pratik.module.css';

const HEDEFLER = [0.8, 0.85, 0.9, 0.93, 0.95] as const;

/**
 * Today's numbers (reviews due, new cards allowed, streak) and the two settings of plan 10.6/2: the daily new
 * card limit and the desired retention. Everything is read from this browser.
 */
export function BugunPaneli({ kartIdleri }: { kartIdleri: string[] }) {
  const kimlik = useId();
  const { depo, guncelle, kaydedilemedi } = useDepo();
  const [kaydedildi, setKaydedildi] = useState(false);

  if (!depo) {
    return (
      <section className={styles.bolum} aria-busy="true" aria-labelledby={`${kimlik}-baslik`}>
        <h2 id={`${kimlik}-baslik`}>{tr.bugun.baslik}</h2>
        <p>{tr.bugun.yukleniyor}</p>
      </section>
    );
  }
  const k = calismaKuyrugu(kartIdleri, depo, new Date());
  const hicYok = k.tekrar.length + k.yeni.length === 0;
  const kaydet = (ayar: Parameters<typeof ayarlaDepo>[1]) => {
    guncelle((d) => ayarlaDepo(d, ayar));
    setKaydedildi(true);
  };
  return (
    <section className={styles.bolum} aria-labelledby={`${kimlik}-baslik`}>
      <h2 id={`${kimlik}-baslik`}>{tr.bugun.baslik}</h2>
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
        <li>
          <strong>{depo.gunluk.tekrar + depo.gunluk.yeni}</strong> {tr.bugun.bugunCalisilan}
        </li>
        <li>
          {tr.bugun.seri}: <strong>{doldur(tr.bugun.seriGun, { gun: depo.seri.gun })}</strong>
          <span className={styles.ipucu}> ({doldur(tr.bugun.enUzun, { gun: depo.seri.enUzun })})</span>
        </li>
      </ul>
      {hicYok ? <p>{tr.bugun.hicYok}</p> : null}
      <div className={styles.eylemler}>
        {kartIdleri.length > 0 ? (
          <a className="kz-dugme kz-dugme--birincil" href="/pratik/bugun" aria-disabled={hicYok}>
            {tr.bugun.basla}
          </a>
        ) : null}
      </div>

      <details className={styles.ayarlar}>
        <summary>{tr.ayar.baslik}</summary>
        <div className={styles.ayarAlani}>
          <label htmlFor={`${kimlik}-sinir`}>{tr.ayar.yeniKartSiniri}</label>
          <input
            id={`${kimlik}-sinir`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            className="kz-alan__girdi"
            value={depo.ayar.yeniKartSiniri}
            aria-describedby={`${kimlik}-sinir-ipucu`}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n)) kaydet({ yeniKartSiniri: Math.min(100, Math.max(0, n)) });
            }}
          />
          <p id={`${kimlik}-sinir-ipucu`} className={styles.ipucu}>
            {tr.ayar.yeniKartIpucu}
          </p>
        </div>
        <div className={styles.ayarAlani}>
          <label htmlFor={`${kimlik}-hedef`}>{tr.ayar.hedef}</label>
          <select
            id={`${kimlik}-hedef`}
            className="kz-alan__girdi"
            value={String(depo.ayar.hedefHatirlama)}
            aria-describedby={`${kimlik}-hedef-ipucu`}
            onChange={(e) => kaydet({ hedefHatirlama: Number(e.target.value) })}
          >
            {HEDEFLER.map((h) => (
              <option key={h} value={String(h)}>
                {doldur(tr.ayar.yuzde, { deger: Math.round(h * 100) })}
              </option>
            ))}
          </select>
          <p id={`${kimlik}-hedef-ipucu`} className={styles.ipucu}>
            {tr.ayar.hedefIpucu}
          </p>
        </div>
        <p role="status" className={styles.ipucu}>
          {kaydedildi ? tr.ayar.kaydedildi : ''}
        </p>
        {kaydedilemedi ? <p role="alert">{tr.deneme.kayitHatasi}</p> : null}
      </details>
    </section>
  );
}
