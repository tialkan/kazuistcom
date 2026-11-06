import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { oyunlar } from './_alan/kart.ts';
import { oyunKartlari } from './_alan/oyun.ts';
import { alanOzetleri, denemeHavuzu, gorunenKartlar, onizlemeAcik, tumDesteler } from './_veri/desteler.ts';
import { BugunPaneli } from './_bilesen/BugunPaneli.tsx';
import { doldur, oyunMetni, tr } from './_bilesen/metin.ts';
import { OnizlemeBandi, SabitNotlar } from './_bilesen/Ortak.tsx';
import styles from './pratik.module.css';

export const metadata: Metadata = {
  title: `${tr.meta.baslik} | ${ortak('tr').marka}`,
  description: tr.meta.aciklama,
};

export default function PratikSayfasi() {
  const onizleme = onizlemeAcik();
  const kartlar = tumDesteler.flatMap((d) => gorunenKartlar(d, onizleme));
  const ozetler = alanOzetleri(onizleme);
  const bekleyen = ozetler.reduce((n, o) => n + o.onayBekleyen, 0);
  const havuz = denemeHavuzu(onizleme);
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{tr.baslik}</h1>
        <p className="sayfa-ust__giris">{tr.giris}</p>
      </header>

      {onizleme ? <OnizlemeBandi /> : null}

      {kartlar.length === 0 ? (
        <section className={styles.not} aria-labelledby="bos-baslik">
          <h2 id="bos-baslik">{tr.bos.baslik}</h2>
          <p>{doldur(tr.bos.metin, { bekleyen })}</p>
        </section>
      ) : null}

      <BugunPaneli kartIdleri={kartlar.map((k) => k.id)} />

      <section className={styles.bolum} aria-labelledby="oyunlar-baslik">
        <h2 id="oyunlar-baslik">{tr.oyunlar.baslik}</h2>
        <ul className={styles.oyunListesi}>
          {oyunlar.map((o) => {
            const metin = oyunMetni(o);
            const n = oyunKartlari(kartlar, o).length;
            return (
              <li key={o} className={styles.oyunKutusu}>
                <h3>{metin.ad}</h3>
                <p>{metin.kisa}</p>
                <p className={styles.ipucu}>
                  {n === 0 ? tr.oyunlar.kartYok : doldur(tr.oyunlar.kartSayisi, { sayi: n })}
                </p>
              </li>
            );
          })}
        </ul>
        <p>{tr.oyunlar.nasil}</p>
      </section>

      <section className={styles.bolum} aria-labelledby="desteler-baslik">
        <h2 id="desteler-baslik">{tr.desteler.baslik}</h2>
        <p>{tr.desteler.aciklama}</p>
        <ul className={styles.desteListesi}>
          {ozetler
            .filter((o) => o.deste)
            .map((o) => (
              <li key={o.alan.slug}>
                <a href={`/pratik/deste/${o.alan.slug}`}>{o.alan.ad}</a>
                <span className={styles.ipucu}>
                  {' '}
                  {doldur(tr.oyunlar.kartSayisi, { sayi: o.gorunen })}
                  {o.onayBekleyen > 0 && !onizleme
                    ? `, ${doldur(tr.desteler.bekleyenSayisi, { sayi: o.onayBekleyen })}`
                    : ''}
                </span>
              </li>
            ))}
        </ul>
        <p>
          <a href="/pratik/hmgs">{tr.meta.hmgsBaslik}</a>
          <span className={styles.ipucu}> ({doldur(tr.hmgs.havuz, { sayi: havuz.length })})</span>
        </p>
      </section>

      <SabitNotlar />
    </div>
  );
}
