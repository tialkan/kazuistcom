import type { Metadata } from 'next';
import { AdimListesi } from '../_bilesen/AdimListesi.tsx';
import { EtikKutusu } from '../_bilesen/EtikKutusu.tsx';
import { RehberUst, SabitNotlar } from '../_bilesen/Ortak.tsx';
import { adimGorunumu, tr } from '../_bilesen/metin.ts';
import { kaynakBul, tez } from '../_veri/rehberler.ts';
import styles from '../rehberler.module.css';

export const metadata: Metadata = {
  title: tr.meta.tezBaslik,
  description: tr.meta.tezAciklama,
};

export default function TezRehberiSayfasi() {
  const adimlar = tez.adimlar.map((a, i) => adimGorunumu(a, i + 1, kaynakBul(a.dayanak)));
  return (
    <div className="sayfa">
      <RehberUst baslik={tez.baslik} giris={tez.ozet} guncelleme={tez.guncelleme} aktif="tez" />
      <EtikKutusu />

      <section className={styles.bolum} aria-labelledby="model-baslik">
        <h2 id="model-baslik">{tr.tez.modelBaslik}</h2>
        <p>{tez.modelUyari}</p>
        <ol className={styles.model}>
          {tez.model.map((m) => (
            <li key={m.baslik}>
              <strong>{m.baslik}</strong>
              <span>{m.aciklama}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.bolum} aria-labelledby="adimlar-baslik">
        <h2 id="adimlar-baslik">{tr.tez.adimlarBaslik}</h2>
        <AdimListesi liste="tez" adimlar={adimlar} />
      </section>

      <section className={styles.bolum} aria-labelledby="kaynaklar-baslik">
        <h2 id="kaynaklar-baslik">{tr.tez.kaynakBaslik}</h2>
        <p>{tr.tez.kaynakAciklama}</p>
        <ul className={styles.kaynaklar}>
          {tez.kaynaklar.map((k) => (
            <li key={k.id} id={`kaynak-${k.id}`}>
              <p>
                <a href={k.url} rel="noopener noreferrer">
                  {k.kunye}
                </a>
              </p>
              <p className={styles.ipucu}>
                <span className={styles.rozet}>{tr.tez.rozet[k.dogrulama]}</span> {k.dogrulamaNotu}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <SabitNotlar />
    </div>
  );
}
