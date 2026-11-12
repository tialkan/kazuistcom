import type { Metadata } from 'next';
import { EtikKutusu } from './_bilesen/EtikKutusu.tsx';
import { IlerlemeOzeti } from './_bilesen/IlerlemeOzeti.tsx';
import { gorunumler, RehberUst, SabitNotlar } from './_bilesen/Ortak.tsx';
import { tr } from './_bilesen/metin.ts';
import { gecerliIdler } from './_veri/rehberler.ts';
import styles from './rehberler.module.css';

export const metadata: Metadata = {
  title: tr.meta.baslik,
  description: tr.meta.aciklama,
};

const ilerlemeListesi = {
  makale: { liste: 'makale', idler: gecerliIdler.makale, sablon: 'adim' },
  tez: { liste: 'tez', idler: gecerliIdler.tez, sablon: 'adim' },
  kontrol: { liste: 'kontrol', idler: gecerliIdler.kontrol, sablon: 'madde' },
} as const;

export default function RehberlerSayfasi() {
  return (
    <div className="sayfa">
      <RehberUst baslik={tr.baslik} giris={tr.giris} />
      <EtikKutusu />

      <section className={styles.bolum} aria-labelledby="gorunumler-baslik">
        <h2 id="gorunumler-baslik">{tr.gorunumlerBaslik}</h2>
        <ul className={styles.gorunumListesi}>
          {gorunumler.map((g) => {
            const ilerleme =
              g.anahtar === 'makale' || g.anahtar === 'tez' || g.anahtar === 'kontrol'
                ? ilerlemeListesi[g.anahtar]
                : null;
            return (
              <li key={g.anahtar}>
                <h3>
                  <a href={g.href}>{tr.gorunumler[g.anahtar].ad}</a>
                </h3>
                <p>{tr.gorunumler[g.anahtar].kisa}</p>
                {ilerleme ? (
                  <IlerlemeOzeti
                    liste={ilerleme.liste}
                    idler={[...ilerleme.idler]}
                    durumSablonu={ilerleme.sablon}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className={styles.ipucu}>{tr.ortak.cihazNotu}</p>
      </section>

      <SabitNotlar />
    </div>
  );
}
