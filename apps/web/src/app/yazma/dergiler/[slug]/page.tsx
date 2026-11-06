import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ortak } from '@kazuist/i18n';
import tr from '@kazuist/i18n/tr/yazma.json';
import { SablonIndirme } from '../../_bilesen/SablonIndirme.tsx';
import { degerMetni } from '../../_bilesen/deger-metni.ts';
import { doldur } from '../../_bilesen/yardimci.ts';
import { alanlarOf } from '../../_cekirdek/kural-semasi.ts';
import { yazmaDb } from '../../_sunucu/db.ts';
import { dergiyiBul, onayliKurallar } from '../../_sunucu/dergiler.ts';
import styles from '../../yazma.module.css';

export const dynamic = 'force-dynamic';

const t = tr.dergi;

async function yukle(slug: string) {
  const db = yazmaDb();
  if (!db) return null;
  try {
    const dergi = await dergiyiBul(db, { slug });
    if (!dergi) return null;
    const kurallar = await onayliKurallar(db, dergi.id);
    return kurallar ? { dergi, kurallar } : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await yukle(slug);
  const ad = r?.dergi.name ?? t.bulunamadi;
  return { title: `${doldur(t.baslik, { ad })} | ${ortak('tr').marka}` };
}

export default async function DergiProfili({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await yukle(slug);
  // Only a version an editor approved is shown; a journal with a draft only is a 404.
  if (!r) notFound();
  const { dergi, kurallar } = r;
  const alanlar = alanlarOf('makale');
  const tarih = kurallar.approvedAt
    ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(
        new Date(kurallar.approvedAt),
      )
    : '';
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{doldur(t.baslik, { ad: dergi.name })}</h1>
        <p className="sayfa-ust__giris">
          {dergi.issn ? `${t.issn}: ${dergi.issn}. ` : ''}
          {doldur(t.surum, { surum: kurallar.version, tarih })}
        </p>
        {kurallar.sourceUrl ? (
          <p>
            <a href={kurallar.sourceUrl} rel="noopener noreferrer">
              {t.kaynakBaglantisi}
            </a>
          </p>
        ) : null}
      </header>
      <section className={styles.bolum} aria-labelledby="dergi-kurallari">
        <h2 id="dergi-kurallari">{t.tablo}</h2>
        <div className="kz-tablo" role="region" aria-label={t.tablo} tabIndex={0}>
          <table>
            <caption>{t.tablo}</caption>
            <thead>
              <tr>
                <th scope="col">{tr.sablon.denetim.alan}</th>
                <th scope="col">{tr.sablon.denetim.beklenen}</th>
                <th scope="col">{tr.sablon.denetim.durum}</th>
              </tr>
            </thead>
            <tbody>
              {alanlar.map((k) => {
                const kanit = kurallar.kayit.kanitlar[k];
                const kaynak = kurallar.kayit.kaynaklar[k];
                return (
                  <tr key={k}>
                    <th scope="row">{tr.sablon.adim2.alanlar[k]}</th>
                    <td>{degerMetni(kurallar.kayit.degerler[k])}</td>
                    <td>
                      {tr.sablon.adim2.kaynak[kaynak]}
                      {kaynak === 'kilavuz' && kanit ? (
                        <details>
                          <summary>{tr.sablon.adim2.alintiGoster}</summary>
                          <blockquote className={styles.alinti}>
                            <p>{kanit.alinti}</p>
                            <cite>
                              {kanit.sayfa === null
                                ? tr.sablon.adim2.alintiSayfaYok
                                : doldur(tr.sablon.adim2.alintiSayfa, { sayfa: kanit.sayfa })}
                            </cite>
                          </blockquote>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className={styles.bolum} aria-labelledby="dergi-sablon">
        <h2 id="dergi-sablon">{tr.sablon.adim3.baslik}</h2>
        <SablonIndirme kayit={kurallar.kayit} ad={dergi.name} />
        <p>
          <a href="/yazma">{t.geri}</a>
        </p>
      </section>
    </div>
  );
}
