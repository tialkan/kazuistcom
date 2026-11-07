import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { Tablo } from '@kazuist/ui';
import { islemler, paketler, planlar } from './fiyatlar.ts';
import styles from './fiyatlar.module.css';

const t = ortak();
const f = t.fiyatlar;

export const metadata: Metadata = { title: `${f.baslik} | ${t.marka}`, description: f.aciklama };

export default function FiyatlarSayfasi() {
  const s = f.sutun;
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{f.baslik}</h1>
        <p className="sayfa-ust__giris">{f.giris}</p>
      </header>
      <section className={styles.mobilePlans} aria-labelledby="kullanim-secenekleri">
        <h2 id="kullanim-secenekleri">{f.planlar}</h2>
        {planlar.map((p) => (
          <article key={p.ad} className={styles.usage}>
            <h3>
              {p.ad} <span className={styles.price}>{p.fiyat}</span>
            </h3>
            <dl>
              <div>
                <dt>{s.kime}</dt>
                <dd>{p.kime}</dd>
              </div>
              <div>
                <dt>{s.kredi}</dt>
                <dd>{p.kredi}</dd>
              </div>
              <div>
                <dt>{s.ozellik}</dt>
                <dd>{p.ozellik}</dd>
              </div>
            </dl>
          </article>
        ))}
        <p className={styles.tax}>{f.kdv}</p>
      </section>
      <div className={styles.desktopPlans}>
        <Tablo
          baslik={f.planlar}
          satirAnahtari={(p) => p.ad}
          sutunlar={[
            { anahtar: 'ad', baslik: s.plan, hucre: (p) => p.ad },
            { anahtar: 'kime', baslik: s.kime, hucre: (p) => p.kime },
            { anahtar: 'fiyat', baslik: s.fiyat, hucre: (p) => p.fiyat },
            { anahtar: 'kredi', baslik: s.kredi, hucre: (p) => p.kredi },
            { anahtar: 'ozellik', baslik: s.ozellik, hucre: (p) => p.ozellik },
          ]}
          satirlar={planlar}
          not={f.kdv}
        />
      </div>
      <Tablo
        baslik={f.paketler}
        satirAnahtari={(p) => p.ad}
        sutunlar={[
          { anahtar: 'ad', baslik: s.paket, hucre: (p) => p.ad },
          { anahtar: 'kredi', baslik: s.krediMiktari, hucre: (p) => p.kredi, sayisal: true },
          { anahtar: 'fiyat', baslik: s.fiyat, hucre: (p) => p.fiyat, sayisal: true },
          { anahtar: 'krediBasi', baslik: s.krediBasi, hucre: (p) => p.krediBasi, sayisal: true },
        ]}
        satirlar={paketler}
        not={f.kdv}
      />
      <Tablo
        baslik={f.islemler}
        satirAnahtari={(p) => p.ad}
        sutunlar={[
          { anahtar: 'ad', baslik: s.islem, hucre: (p) => p.ad },
          { anahtar: 'kredi', baslik: s.krediBedeli, hucre: (p) => p.kredi, sayisal: true },
        ]}
        satirlar={islemler}
      />
      <h2>{f.kurallarBaslik}</h2>
      <ul className="duz-liste">
        {[f.kural['1'], f.kural['2'], f.kural['3'], f.kural['4']].map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    </div>
  );
}
