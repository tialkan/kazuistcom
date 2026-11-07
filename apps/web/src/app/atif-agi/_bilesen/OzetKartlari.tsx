import type { AgOzeti } from '../_alan/tipler.ts';
import { doldur, sayiTr, tr } from './metin.ts';
import styles from '../atif-agi.module.css';

/** Summary cards (FR-27): decision count, work count, doctrine citation count, most cited works. */
export function OzetKartlari({ ozet }: { ozet: AgOzeti }) {
  const kartlar = [
    { ad: tr.ozet.kararSayisi, deger: ozet.kararSayisi },
    { ad: tr.ozet.eserSayisi, deger: ozet.eserSayisi },
    { ad: tr.ozet.doktrinAtfiSayisi, deger: ozet.doktrinAtfiSayisi },
    { ad: tr.ozet.kararAtfiSayisi, deger: ozet.kararAtfiSayisi },
  ];
  return (
    <section aria-labelledby="ozet-baslik" className={styles.ozet}>
      <h2 id="ozet-baslik" className="kz-gorunmez">
        {tr.ozet.baslik}
      </h2>
      <ul className={styles.kartlar}>
        {kartlar.map((k) => (
          <li key={k.ad} className={styles.kart}>
            <span className={styles.kartSayi}>{sayiTr(k.deger)}</span>
            <span className={styles.kartAd}>{k.ad}</span>
          </li>
        ))}
        <li className={`${styles.kart} ${styles.kartGenis}`}>
          <span className={styles.kartAd}>{tr.ozet.enCok}</span>
          {ozet.enCokAtifAlanlar.length === 0 ? (
            <span>{tr.ozet.enCokYok}</span>
          ) : (
            <ul className={styles.enCok}>
              {ozet.enCokAtifAlanlar.map((e) => (
                <li key={e.id}>
                  <strong>{e.baslik}</strong> ({doldur(tr.ozet.enCokSayi, { sayi: e.sayi })})
                </li>
              ))}
            </ul>
          )}
        </li>
      </ul>
    </section>
  );
}
