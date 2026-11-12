import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/tespit.json';
import { Denetleyici } from './_bilesen/Denetleyici.tsx';
import { KopyalaDugmesi } from './_bilesen/KopyalaDugmesi.tsx';
import { doldur } from './_bilesen/kopyala.ts';
import { grupla, kuralKimligi, kuralOzetleri, kuralSeti } from './_veri/kurallar.ts';
import { maddeler } from './_veri/ayristir.ts';
import styles from './tespit.module.css';

export const metadata: Metadata = {
  title: tr.meta.baslik,
  description: tr.meta.aciklama,
};

const INDIR = '/tespit/yazim-kurallari.md';

export default function TespitSayfasi() {
  const surum = doldur(tr.surumSatiri, {
    surum: kuralSeti.surum,
    donem: kuralSeti.donem,
    bolum: kuralSeti.bolumler.length,
    madde: maddeler(kuralSeti).length,
  });
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{tr.baslik}</h1>
        <p className="sayfa-ust__giris">{tr.giris}</p>
        <p>{tr.amac}</p>
        <p>
          {tr.yazma.metin} <a href="/yazma">{tr.yazma.baglanti}</a>
        </p>
        <p className={styles.surum}>{surum}</p>
      </header>

      <section className={styles.bolum} aria-labelledby="tespit-istem-baslik">
        <h2 id="tespit-istem-baslik">{tr.istem.baslik}</h2>
        <p className={styles.okuma}>{tr.istem.aciklama}</p>
        <KopyalaDugmesi istem={kuralSeti.istem} indirHref={INDIR} />
      </section>

      <section className={styles.bolum} aria-labelledby="tespit-denetleyici-baslik">
        <h2 id="tespit-denetleyici-baslik">{tr.denetleyici.baslik}</h2>
        <p className={styles.okuma}>{tr.denetleyici.aciklama}</p>
        <Denetleyici kuralOzetleri={kuralOzetleri} />
      </section>

      <section className={styles.bolum} aria-labelledby="tespit-kurallar-baslik">
        <h2 id="tespit-kurallar-baslik">{tr.kurallar.baslik}</h2>
        <p className={styles.okuma}>{tr.kurallar.aciklama}</p>
        <nav aria-label={tr.kurallar.bolumler}>
          <ol className={styles.icindekiler}>
            {kuralSeti.bolumler.map((b) => (
              <li key={b.no}>
                <a href={`#bolum-${b.no}`}>
                  <span className="kz-mono">{b.no}</span> {b.baslik}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        {kuralSeti.bolumler.map((b) => {
          const sayi = b.bloklar.filter((x) => x.tur === 'madde').length;
          return (
            <section
              key={b.no}
              id={`bolum-${b.no}`}
              className={styles.kuralBolumu}
              aria-labelledby={`bolum-baslik-${b.no}`}
            >
              <h3 id={`bolum-baslik-${b.no}`}>
                <span className={styles.bolumNo}>{doldur(tr.kurallar.bolum, { no: b.no })}</span>
                {b.baslik}
              </h3>
              <p className={styles.sayiNotu}>{doldur(tr.kurallar.maddeSayisi, { sayi })}</p>
              {grupla(b.bloklar).map((g, i) =>
                g.tur === 'paragraf' ? (
                  <p key={i} className={styles.okuma}>
                    {g.metin}
                  </p>
                ) : (
                  <ol key={i} className={styles.maddeler} role="list">
                    {g.maddeler.map((m) => (
                      <li key={m.id} id={kuralKimligi(m.id)} className={styles.madde}>
                        <span className={`kz-mono ${styles.maddeNo}`}>{m.id}</span>
                        <span>{m.metin}</span>
                      </li>
                    ))}
                  </ol>
                ),
              )}
            </section>
          );
        })}
      </section>
    </div>
  );
}
