import type { Metadata } from 'next';
import { AdimListesi } from '../_bilesen/AdimListesi.tsx';
import { EtikKutusu } from '../_bilesen/EtikKutusu.tsx';
import { RehberUst, SabitNotlar } from '../_bilesen/Ortak.tsx';
import { adimGorunumu, tr } from '../_bilesen/metin.ts';
import { makale } from '../_veri/rehberler.ts';
import styles from '../rehberler.module.css';

export const metadata: Metadata = {
  title: tr.meta.makaleBaslik,
  description: tr.meta.makaleAciklama,
};

export default function MakaleRehberiSayfasi() {
  return (
    <div className="sayfa">
      <RehberUst baslik={makale.baslik} giris={makale.ozet} guncelleme={makale.guncelleme} aktif="makale" />
      <EtikKutusu />
      <section className={styles.bolum} aria-labelledby="adimlar-baslik">
        <h2 id="adimlar-baslik">{tr.makale.adimlarBaslik}</h2>
        <AdimListesi liste="makale" adimlar={makale.adimlar.map((a, i) => adimGorunumu(a, i + 1))} />
      </section>
      <SabitNotlar />
    </div>
  );
}
