import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { bosAg } from './_alan/ag.ts';
import { sayfaParametreleri, type Parametreler } from './_alan/sayfa.ts';
import type { AgFiltresi, AtifAgi } from './_alan/tipler.ts';
import { AgGorunumu } from './_bilesen/AgGorunumu.tsx';
import { doldur, tr } from './_bilesen/metin.ts';
import { OzetKartlari } from './_bilesen/OzetKartlari.tsx';
import { Suzgec } from './_bilesen/Suzgec.tsx';
import { Tablolar } from './_bilesen/Tablolar.tsx';
import { agiGetir, filtreOku } from './_sunucu/api.ts';
import { KARAR_SINIRI } from './_sunucu/sql.ts';
import styles from './atif-agi.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${tr.meta.baslik} | ${ortak('tr').marka}`,
  description: tr.meta.aciklama,
};

export default async function AtifAgiSayfasi({ searchParams }: { searchParams: Promise<Parametreler> }) {
  const { gorunum, sorgu } = sayfaParametreleri(await searchParams);
  const okunan = filtreOku(new URL(`http://x/?${sorgu.toString()}`));
  const filtre: AgFiltresi = okunan.ok ? okunan.filtre : {};
  const ag: AtifAgi | null = await agiGetir(filtre).catch(() => null);
  const veri = ag ?? bosAg(filtre);
  const kalan = new URLSearchParams(sorgu);
  const baglanti = (g: 'ag' | 'tablo') => {
    const q = new URLSearchParams(kalan);
    q.set('gorunum', g);
    return `/atif-agi?${q.toString()}`;
  };

  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{tr.baslik}</h1>
        <p className="sayfa-ust__giris">{tr.giris}</p>
        <p className={styles.ipucu}>{tr.kapsamNotu}</p>
      </header>

      {veri.meta.kaynak === 'fikstur' ? (
        <aside className={styles.not} aria-label={tr.durum.ornek}>
          <p>{tr.durum.ornek}</p>
        </aside>
      ) : null}
      {!okunan.ok ? (
        <p className={styles.not} role="alert">
          {tr.filtre.gecersiz}
        </p>
      ) : null}
      {ag === null ? (
        <p className={styles.not} role="alert">
          {tr.durum.hata}
        </p>
      ) : null}

      <Suzgec filtre={filtre} gorunum={gorunum} />

      <OzetKartlari ozet={veri.summary} />

      <nav aria-label={tr.gorunum.baslik} className={styles.gorunum}>
        <ul>
          <li>
            <a href={baglanti('ag')} aria-current={gorunum === 'ag' ? 'page' : undefined}>
              {tr.gorunum.ag}
            </a>
          </li>
          <li>
            <a href={baglanti('tablo')} aria-current={gorunum === 'tablo' ? 'page' : undefined}>
              {tr.gorunum.tablo}
            </a>
          </li>
        </ul>
      </nav>
      {gorunum === 'ag' ? <p className={styles.ipucu}>{tr.gorunum.tabloAciklama}</p> : null}

      {ag && !veri.meta.doktrinVerisi ? <p className={styles.not}>{tr.durum.doktrinYok}</p> : null}
      {veri.meta.kuyrukta > 0 ? (
        <p className={styles.ipucu}>{doldur(tr.durum.kuyrukta, { sayi: veri.meta.kuyrukta })}</p>
      ) : null}
      {veri.meta.kesildi ? (
        <p className={styles.not}>{doldur(tr.durum.kesildi, { sinir: KARAR_SINIRI })}</p>
      ) : null}

      {ag && veri.nodes.length === 0 ? (
        <section className={styles.not} aria-labelledby="bos-baslik">
          <h2 id="bos-baslik">{tr.durum.bos}</h2>
          <p>{tr.durum.bosAciklama}</p>
        </section>
      ) : gorunum === 'ag' ? (
        <AgGorunumu ag={veri} />
      ) : (
        <Tablolar ag={veri} />
      )}

      <footer className={styles.sabit}>
        <p>{tr.sabit.kaynakNotu}</p>
        <p>{ortak('tr').uyari.danismanlik}</p>
      </footer>
    </div>
  );
}
