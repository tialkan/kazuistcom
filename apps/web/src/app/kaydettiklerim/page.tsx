import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import ara from '@kazuist/i18n/tr/ara.json';
import tr from '@kazuist/i18n/tr/kaydettiklerim.json';
import { BosDurum, Dugme, Etiket, HataDurumu } from '@kazuist/ui';
import { toPlainList } from '@kazuist/casuist';
import type { AuthorityClass, RecordStatus, RecordType } from '@kazuist/contracts';
import { doldur, otoriteEtiketi, tarihTr } from '../ara/_bilesen/metin.ts';
import { oturum } from '../ara/_sunucu/oturum.ts';
import { KaldirDugmesi } from './_bilesen/KaldirDugmesi.tsx';
import { KopyalaKaynakca } from './_bilesen/KopyalaKaynakca.tsx';
import { listSaved, type SavedRow } from './_sunucu/kutuphane.ts';
import styles from './kaydettiklerim.module.css';

export const metadata: Metadata = {
  title: `${tr.meta.baslik} | ${ortak().marka}`,
  description: tr.meta.aciklama,
  robots: { index: false, follow: false },
};

/** Up to 2000 items on one page; the API pages by 50 for other clients. */
const SAYFA_SINIRI = 2000;

function Liste({ rows }: { rows: SavedRow[] }) {
  return (
    <ol className={styles.liste}>
      {rows.map((r) => {
        const baslikId = `kayit-${r.id}`;
        const kunye = [
          r.court && !r.title.startsWith(r.court) ? r.court : null,
          r.esasNo && !r.title.includes(r.esasNo) ? `E. ${r.esasNo}` : null,
          r.kararNo && !r.title.includes(r.kararNo) ? `K. ${r.kararNo}` : null,
          r.date ? `${r.type === 'mevzuat' ? 'RG' : 'T.'} ${tarihTr(r.date)}` : null,
        ].filter(Boolean);
        return (
          <li key={r.id} className={styles.kayit}>
            <p className={styles.tur}>{ara.tur[r.type as RecordType]}</p>
            <h3 id={baslikId} className={styles.baslik}>
              {r.title}
            </h3>
            <p className={styles.meta}>
              <Etiket tur={otoriteEtiketi(r.authorityClass as AuthorityClass)}>
                {ara.otorite[r.authorityClass as AuthorityClass]}
              </Etiket>
              {r.status !== 'bilinmiyor' ? (
                <span className={styles.durumMetni}>{ara.durum[r.status as RecordStatus]}</span>
              ) : null}
            </p>
            {kunye.length ? <p className={`${styles.kunye} kz-mono`}>{kunye.join(' · ')}</p> : null}
            {r.note ? (
              <p className={styles.not}>
                <span className={styles.notBaslik}>{tr.liste.not}: </span>
                {r.note}
              </p>
            ) : null}
            <p className={styles.tarih}>
              {doldur(tr.liste.kaydedilme, { tarih: tarihTr(r.createdAt) ?? '' })}
            </p>
            <div className={styles.eylemler}>
              <a className={styles.eylem} href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
                {tr.liste.kaynagaGit}
                <span className="kz-gorunmez">
                  : {doldur(tr.liste.kaynagaGitEtiket, { baslik: r.title })}
                </span>
              </a>
              <KaldirDugmesi id={r.id} baslikId={baslikId} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** /kaydettiklerim (plan 10.2/4, FR-23..25): saved sources, copy and export of the bibliography. */
export default async function KaydettiklerimSayfasi() {
  const ust = (
    <header className="sayfa-ust">
      <h1>{tr.baslik}</h1>
      <p className="sayfa-ust__giris">{tr.giris}</p>
    </header>
  );
  const { principal, ctx } = await oturum();
  if (!principal || !ctx)
    return (
      <div className="sayfa">
        {ust}
        <BosDurum
          baslik={tr.girisGerekli.baslik}
          aciklama={<p>{tr.girisGerekli.aciklama}</p>}
          eylem={<Dugme href="/giris">{tr.girisGerekli.bag}</Dugme>}
        />
      </div>
    );

  let rows: SavedRow[];
  try {
    rows = await listSaved(ctx.db, principal.userId, { limit: SAYFA_SINIRI });
  } catch (e) {
    console.error(JSON.stringify({ at: 'kaydettiklerim', error: (e as Error)?.name }));
    return (
      <div className="sayfa">
        {ust}
        <HataDurumu baslik={tr.hata.yuklenemedi} />
      </div>
    );
  }

  return (
    <div className="sayfa">
      {ust}
      <p className={styles.uyari} role="note">
        {tr.uyari}
      </p>
      {rows.length ? (
        <>
          <section aria-labelledby="liste-baslik" className={styles.bolum}>
            <h2 id="liste-baslik">
              {tr.liste.baslik}{' '}
              <span className={styles.sayi}>{doldur(tr.liste.sayi, { sayi: rows.length })}</span>
            </h2>
            <Liste rows={rows} />
          </section>
          <section aria-labelledby="disa-baslik" className={styles.bolum}>
            <h2 id="disa-baslik">{tr.disa.baslik}</h2>
            <KopyalaKaynakca metin={toPlainList(rows)} />
            <ul className={styles.indir}>
              <li>
                <a
                  className={styles.eylem}
                  href="/api/v1/library/export?format=ris"
                  download="kaydettiklerim.ris"
                >
                  {tr.disa.ris}
                </a>
              </li>
              <li>
                <a
                  className={styles.eylem}
                  href="/api/v1/library/export?format=bibtex"
                  download="kaydettiklerim.bib"
                >
                  {tr.disa.bibtex}
                </a>
              </li>
            </ul>
            <p className={styles.not}>{tr.disa.bicimNotu}</p>
          </section>
        </>
      ) : (
        <BosDurum
          baslik={tr.bos.baslik}
          aciklama={<p>{tr.bos.aciklama}</p>}
          eylem={<Dugme href="/ara">{tr.bos.bag}</Dugme>}
        />
      )}
    </div>
  );
}
