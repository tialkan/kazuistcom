'use client';

import { Dugme } from '@kazuist/ui';
import { yuzde } from '../_alan/ilerleme.ts';
import styles from '../rehberler.module.css';
import { doldur, tr } from './metin.ts';
import { useIlerleme } from './useIlerleme.ts';

export interface MaddeGorunumu {
  id: string;
  no: number;
  etiket: string;
  metin: string;
  kural: { no: string; href: string } | null;
  baglanti: { href: string; etiket: string } | null;
}

/** The 14 item checklist (FR-36): tickable items with the "Makale ve tez" or "Yalnızca tez" label. */
export function KontrolListesi({ maddeler }: { maddeler: MaddeGorunumu[] }) {
  const { depo, isaretle, temizle, kaydedilemedi } = useIlerleme({ kontrol: maddeler.map((m) => m.id) });
  const biten = new Set(depo?.kontrol ?? []);
  const toplam = maddeler.length;
  const yapilan = biten.size;
  const durum = doldur(tr.ilerleme.durumMadde, { yapilan, toplam });

  return (
    <div>
      <div className={styles.ilerlemeKutusu}>
        <p className={styles.ilerlemeSatiri} aria-live="polite">
          <strong>{durum}</strong>
          <span className={styles.ipucu}>{yuzde(yapilan, toplam)}%</span>
        </p>
        <progress className={styles.cubuk} max={toplam} value={yapilan} aria-label={tr.ilerleme.cubuk}>
          {durum}
        </progress>
        <p className={styles.ipucu}>{tr.ortak.cihazNotu}</p>
        {kaydedilemedi ? (
          <p role="status" className={styles.uyariSatiri}>
            {tr.ilerleme.kaydedilemedi}
          </p>
        ) : null}
        {yapilan > 0 ? (
          <Dugme tur="sessiz" onClick={() => temizle('kontrol')}>
            {tr.ilerleme.temizle}
          </Dugme>
        ) : null}
      </div>

      <ul className={styles.maddeListesi} aria-label={tr.kontrol.listeAdi}>
        {maddeler.map((m) => {
          const tamam = biten.has(m.id);
          const girdiId = `kontrol-${m.id}`;
          return (
            <li key={m.id} className={styles.madde} data-tamam={tamam ? 'evet' : 'hayir'}>
              <input
                id={girdiId}
                type="checkbox"
                checked={tamam}
                onChange={(e) => isaretle('kontrol', m.id, e.target.checked)}
              />
              <div>
                <label htmlFor={girdiId} className={styles.maddeMetni}>
                  <span className={`${styles.adimNo} kz-mono`}>{m.no}.</span> {m.metin}
                </label>
                <p className={styles.maddeAlti}>
                  <span className={styles.rozet}>{m.etiket}</span>
                  {m.kural ? (
                    <a href={m.kural.href} className={styles.baglanti}>
                      {doldur(tr.kontrol.kural, { no: m.kural.no })}
                    </a>
                  ) : null}
                  {m.baglanti ? (
                    <a href={m.baglanti.href} className={styles.baglanti}>
                      {m.baglanti.etiket}
                    </a>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
