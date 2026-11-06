'use client';

import { useMemo, useState } from 'react';
import { desteIlerlemesi, yanlisKartlar } from '../_alan/depo.ts';
import { oyunlar, type KartGorunumu, type Oyun } from '../_alan/kart.ts';
import { oyunKartlari } from '../_alan/oyun.ts';
import { Calisma } from './Calisma.tsx';
import { OyunTuru } from './OyunTuru.tsx';
import { doldur, oyunMetni, sayiTr, tr } from './metin.ts';
import { useDepo } from './useDepo.ts';
import styles from '../pratik.module.css';

type Mod = 'calis' | 'yanlis' | Oyun;

interface Props {
  kartlar: readonly KartGorunumu[];
  bekleyen: number;
}

/** A deck: progress, the spaced repetition session, one round per game and a round of the wrong answers. */
export function DesteEkrani({ kartlar, bekleyen }: Props) {
  const { depo } = useDepo();
  const [mod, setMod] = useState<Mod | null>(null);
  const idler = useMemo(() => kartlar.map((k) => k.id), [kartlar]);
  const ilerleme = depo ? desteIlerlemesi(idler, depo, new Date()) : null;
  const yanlislar = useMemo(() => {
    if (!depo) return [];
    const set = new Set(yanlisKartlar(depo));
    return kartlar.filter((k) => set.has(k.id));
  }, [depo, kartlar]);

  if (kartlar.length === 0) {
    return (
      <section className={styles.bolum}>
        <p>{tr.deste.kartYok}</p>
        {bekleyen > 0 ? <p>{doldur(tr.deste.bekleyenNot, { sayi: bekleyen })}</p> : null}
      </section>
    );
  }

  const kapat = () => setMod(null);
  if (mod === 'calis')
    return <Calisma key="calis" kartlar={kartlar} baslik={tr.calisma.baslik} kapat={kapat} />;
  if (mod === 'yanlis') {
    return <OyunTuru key="yanlis" kartlar={yanlislar} baslik={tr.deste.yanlislarim} kapat={kapat} />;
  }
  if (mod) {
    const metin = oyunMetni(mod);
    return (
      <OyunTuru
        key={mod}
        kartlar={oyunKartlari(kartlar, mod)}
        baslik={metin.ad}
        aciklama={metin.yonerge}
        kapat={kapat}
      />
    );
  }

  return (
    <>
      <section className={styles.bolum} aria-labelledby="ilerleme-baslik">
        <h2 id="ilerleme-baslik">{tr.deste.ilerleme}</h2>
        <p>{doldur(tr.deste.kartSayisi, { sayi: kartlar.length })}</p>
        {ilerleme ? (
          <ul className={styles.sayilar}>
            <li>{doldur(tr.deste.ilerlemeYeni, { sayi: ilerleme.yeni })}</li>
            <li>{doldur(tr.deste.ilerlemeOgrenilen, { sayi: ilerleme.ogrenilen })}</li>
            <li>{doldur(tr.deste.ilerlemeVade, { sayi: ilerleme.vadesiGelen })}</li>
            {ilerleme.basariOrani !== null ? (
              <li>{doldur(tr.deste.ilerlemeBasari, { oran: sayiTr(ilerleme.basariOrani * 100) })}</li>
            ) : null}
          </ul>
        ) : (
          <p aria-busy="true">{tr.bugun.yukleniyor}</p>
        )}
        <progress
          className={styles.ilerleme}
          value={ilerleme?.ogrenilen ?? 0}
          max={Math.max(1, kartlar.length)}
          aria-label={tr.deste.ilerleme}
        >
          {ilerleme?.ogrenilen ?? 0} / {kartlar.length}
        </progress>
        {bekleyen > 0 ? <p>{doldur(tr.deste.bekleyenNot, { sayi: bekleyen })}</p> : null}
      </section>

      <section className={styles.bolum} aria-labelledby="modlar-baslik">
        <h2 id="modlar-baslik">{tr.deste.modlar}</h2>
        <ul className={styles.modListesi}>
          <li>
            <button type="button" className={styles.modDugme} onClick={() => setMod('calis')}>
              <strong>{tr.deste.calis}</strong>
              <span>{tr.deste.calisKisa}</span>
            </button>
          </li>
          {oyunlar.map((o) => {
            const n = oyunKartlari(kartlar, o).length;
            const metin = oyunMetni(o);
            return (
              <li key={o}>
                <button
                  type="button"
                  className={styles.modDugme}
                  onClick={() => setMod(o)}
                  disabled={n === 0}
                >
                  <strong>{metin.ad}</strong>
                  <span>
                    {metin.kisa} ({n === 0 ? tr.oyunlar.kartYok : doldur(tr.oyunlar.kartSayisi, { sayi: n })})
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className={styles.modDugme}
              onClick={() => setMod('yanlis')}
              disabled={yanlislar.length === 0}
            >
              <strong>{tr.deste.yanlislarim}</strong>
              <span>
                {tr.deste.yanlislarimKisa}
                {yanlislar.length === 0 ? ` (${tr.deste.yanlisYok})` : ` (${yanlislar.length})`}
              </span>
            </button>
          </li>
        </ul>
      </section>
    </>
  );
}
