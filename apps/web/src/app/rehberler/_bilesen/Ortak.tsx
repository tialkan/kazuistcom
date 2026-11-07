import { ortak } from '@kazuist/i18n';
import styles from '../rehberler.module.css';
import { doldur, tarihTr, tr } from './metin.ts';

export const gorunumler = [
  { anahtar: 'makale', href: '/rehberler/makale' },
  { anahtar: 'tez', href: '/rehberler/tez' },
  { anahtar: 'zotero', href: '/rehberler/zotero-endnote' },
  { anahtar: 'kontrol', href: '/rehberler/kontrol-listesi' },
  { anahtar: 'etik', href: '/rehberler/etik' },
] as const;
export type GorunumAnahtari = (typeof gorunumler)[number]['anahtar'];

/** Links between the guide views. The current view is marked with aria-current and a text-visible underline. */
export function RehberGezinmesi({ aktif }: { aktif?: GorunumAnahtari }) {
  return (
    <nav className={styles.gezinme} aria-label={tr.gezinme.aria}>
      <ul>
        <li>
          <a href="/rehberler" aria-current={aktif === undefined ? 'page' : undefined}>
            {tr.gezinme.tumu}
          </a>
        </li>
        {gorunumler.map((g) => (
          <li key={g.anahtar}>
            <a href={g.href} aria-current={aktif === g.anahtar ? 'page' : undefined}>
              {tr.gorunumler[g.anahtar].ad}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function RehberUst({
  baslik,
  giris,
  guncelleme,
  aktif,
}: {
  baslik: string;
  giris: string;
  guncelleme?: string;
  aktif?: GorunumAnahtari;
}) {
  return (
    <>
      <RehberGezinmesi aktif={aktif} />
      <header className="sayfa-ust">
        <h1>{baslik}</h1>
        <p className="sayfa-ust__giris">{giris}</p>
        {guncelleme ? (
          <p className={styles.ipucu}>{doldur(tr.ortak.guncelleme, { tarih: tarihTr(guncelleme) })}</p>
        ) : null}
      </header>
    </>
  );
}

/** Fixed notes at the foot of every guide page: institute precedence, /tespit, the product advice notice. */
export function SabitNotlar() {
  return (
    <footer className={styles.sabitNotlar}>
      <p>{tr.ortak.yonetmelikNotu}</p>
      <p>
        {tr.ortak.tespitNotu}{' '}
        <a href="/tespit" className={styles.baglanti}>
          {tr.ortak.tespitBaglanti}
        </a>
      </p>
      <p>{ortak().uyari.danismanlik}</p>
    </footer>
  );
}

export function KaynakListesi({
  baslik,
  kaynaklar,
}: {
  baslik: string;
  kaynaklar: { ad: string; url: string; okuma: string }[];
}) {
  return (
    <section className={styles.bolum} aria-labelledby="kaynaklar-baslik">
      <h2 id="kaynaklar-baslik">{baslik}</h2>
      <ul className={styles.kaynaklar}>
        {kaynaklar.map((k) => (
          <li key={k.url}>
            <a href={k.url} rel="noopener noreferrer">
              {k.ad}
            </a>{' '}
            <span className={styles.ipucu}>
              ({doldur(tr.ortak.okumaTarihi, { tarih: tarihTr(k.okuma) })})
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
