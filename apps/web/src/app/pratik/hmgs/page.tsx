import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { denemeKur, denemeyeUygun } from '../_alan/deneme.ts';
import { hmgsAlanlari } from '../_alan/hmgs-alanlari.ts';
import { alanOzetleri, denemeHavuzu, onizlemeAcik } from '../_veri/desteler.ts';
import { DenemeRaporu } from '../_bilesen/DenemeRaporu.tsx';
import { doldur, sayiTr, tr } from '../_bilesen/metin.ts';
import { OnizlemeBandi, SabitNotlar } from '../_bilesen/Ortak.tsx';
import styles from '../pratik.module.css';

export const metadata: Metadata = {
  title: `${tr.meta.hmgsBaslik} | ${ortak().marka}`,
  description: tr.meta.hmgsAciklama,
};

export default function HmgsSayfasi() {
  const onizleme = onizlemeAcik();
  const ozetler = alanOzetleri(onizleme);
  const havuz = denemeHavuzu(onizleme);
  const uygunSayisi = havuz.filter(denemeyeUygun).length;
  const plan = denemeKur(havuz, 1);
  const eksikKonular = plan.eksikler.map((e) => e.ad).join(', ');
  const toplamSoru = hmgsAlanlari.reduce((n, a) => n + a.denemeSorusu, 0);
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <p>
          <a href="/pratik">{tr.deste.geri}</a>
        </p>
        <h1>{tr.hmgs.baslik}</h1>
        <p className="sayfa-ust__giris">{tr.hmgs.giris}</p>
      </header>

      {onizleme ? <OnizlemeBandi /> : null}

      <section className={styles.bolum} aria-labelledby="sinav-baslik">
        <h2 id="sinav-baslik">{tr.hmgs.sinav.baslik}</h2>
        <ul>
          <li>{tr.hmgs.sinav.madde1}</li>
          <li>{tr.hmgs.sinav.madde2}</li>
          <li>{tr.hmgs.sinav.madde3}</li>
          <li>{tr.hmgs.sinav.madde4}</li>
        </ul>
        <p>{tr.hmgs.sinav.ozgun}</p>
        <p>{tr.hmgs.secenekNotu}</p>
      </section>

      <section className={styles.bolum} aria-labelledby="deneme-baslik">
        <h2 id="deneme-baslik">{tr.meta.denemeBaslik}</h2>
        <p>{doldur(tr.hmgs.havuz, { sayi: uygunSayisi })}</p>
        {plan.soruSayisi === 0 ? (
          <>
            <p>{tr.bos.hmgsMetin}</p>
            <p>
              <span className="kz-dugme kz-dugme--birincil" aria-disabled="true">
                {tr.hmgs.denemeKapali}
              </span>
            </p>
          </>
        ) : (
          <>
            {plan.tam ? (
              <p>{tr.hmgs.tam}</p>
            ) : (
              <div className={styles.not}>
                <h3>{tr.hmgs.kismi.baslik}</h3>
                <p>
                  {doldur(tr.hmgs.kismi.metin, {
                    mevcut: uygunSayisi,
                    soru: plan.soruSayisi,
                    sure: plan.sureDakika,
                  })}
                </p>
                <p>{doldur(tr.hmgs.kismi.eksik, { konular: eksikKonular })}</p>
              </div>
            )}
            <p>
              <a className="kz-dugme kz-dugme--birincil" href="/pratik/hmgs/deneme">
                {tr.hmgs.denemeBasla}
              </a>
            </p>
          </>
        )}
      </section>

      <section className={styles.bolum} aria-labelledby="desteler-baslik">
        <h2 id="desteler-baslik">{tr.desteler.tabloBaslik}</h2>
        <p>{tr.desteler.tabloAciklama}</p>
        <div className={styles.tabloSar} role="region" aria-label={tr.desteler.tabloBaslik} tabIndex={0}>
          <table className={styles.tablo}>
            <caption className="kz-gorunmez">{tr.desteler.tabloAciklama}</caption>
            <thead>
              <tr>
                <th scope="col">{tr.desteler.alan}</th>
                <th scope="col">{tr.desteler.pay}</th>
                <th scope="col">{tr.desteler.denemede}</th>
                <th scope="col">{tr.desteler.yayinda}</th>
                <th scope="col">{tr.desteler.bekleyen}</th>
                <th scope="col">{tr.desteler.hedef}</th>
              </tr>
            </thead>
            <tbody>
              {ozetler.map((o) => (
                <tr key={o.alan.slug}>
                  <th scope="row">
                    {o.deste ? (
                      <a
                        href={`/pratik/deste/${o.alan.slug}`}
                        aria-label={doldur(tr.desteler.ac, { alan: o.alan.ad })}
                      >
                        {o.alan.ad}
                      </a>
                    ) : (
                      <>
                        {o.alan.ad} <span className={styles.ipucu}>({tr.desteler.destesiYok})</span>
                      </>
                    )}
                  </th>
                  <td>
                    {doldur(tr.desteler.payDeger, {
                      pay: sayiTr(o.alan.oranBinde / 10, o.alan.oranBinde % 10 ? 1 : 0),
                    })}
                  </td>
                  <td>{o.alan.denemeSorusu}</td>
                  <td>{o.gorunen}</td>
                  <td>{o.onayBekleyen}</td>
                  <td>{o.alan.hedefSoru}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{tr.desteler.tumu}</th>
                <td>%100</td>
                <td>{toplamSoru}</td>
                <td>{ozetler.reduce((n, o) => n + o.gorunen, 0)}</td>
                <td>{ozetler.reduce((n, o) => n + o.onayBekleyen, 0)}</td>
                <td>{hmgsAlanlari.reduce((n, a) => n + a.hedefSoru, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className={styles.bolum} aria-labelledby="rapor">
        <h2 id="rapor">{tr.hmgs.rapor.baslik}</h2>
        <p>{tr.hmgs.rapor.aciklama}</p>
        <DenemeRaporu />
      </section>

      <SabitNotlar />
    </div>
  );
}
