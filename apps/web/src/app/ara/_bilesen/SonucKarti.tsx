import ara from '@kazuist/i18n/tr/ara.json';
import { Etiket } from '@kazuist/ui';
import { formatNorm, snippet, type RankedRecord } from '@kazuist/casuist';
import { doldur, etiketTuru, otoriteEtiketi, tarihTr } from './metin.ts';
import { KaydetDugmesi } from './KaydetDugmesi.tsx';
import styles from '../ara.module.css';

/** "Neden ilgili" sentence of FR-11, from how the record matched. */
function neden(r: RankedRecord): string {
  if (r.identity) return ara.sonuc.neden.kimlik;
  const norm = r.matchedNorms[0];
  if (norm) return doldur(ara.sonuc.neden.norm, { atif: formatNorm(norm) });
  if (r.matchedTerms.length) return ara.sonuc.neden.terim;
  return ara.sonuc.neden.anlam;
}

function kunye(r: RankedRecord): string[] {
  const x = r.record;
  const parcalar: (string | null)[] = [
    x.court && !x.title.startsWith(x.court) ? x.court : null,
    x.chamber && !x.title.includes(x.chamber) ? x.chamber : null,
    x.esasNo && !x.title.includes(x.esasNo) ? `E. ${x.esasNo}` : null,
    x.kararNo && !x.title.includes(x.kararNo) ? `K. ${x.kararNo}` : null,
    x.date ? (x.type === 'mevzuat' ? `RG ${tarihTr(x.date)}` : `T. ${tarihTr(x.date)}`) : null,
  ];
  return parcalar.filter((p): p is string => Boolean(p));
}

/** Result card of FR-11: type, labels, authority (FR-81), title, citation, why relevant, excerpt, actions. */
export function SonucKarti({ r, girisVar }: { r: RankedRecord; girisVar: boolean }) {
  const x = r.record;
  const yil = x.date?.slice(0, 4);
  const baslikId = `sonuc-baslik-${x.id}`;
  return (
    <article id={`sonuc-${x.id}`} className={styles.kart} aria-labelledby={baslikId}>
      <p className={styles.kartTur}>{ara.tur[x.type]}</p>
      <ul className={styles.etiketler} aria-label={ara.etiketler.baslik}>
        <li>
          <Etiket tur={otoriteEtiketi(x.authorityClass)}>{ara.otorite[x.authorityClass]}</Etiket>
        </li>
        {r.labels.map((l) => (
          <li key={l}>
            <Etiket tur={etiketTuru[l]}>
              {(l === 'yeni' || l === 'yerlesik' || l === 'eski') && yil
                ? `${ara.etiket[l]} ${yil}`
                : ara.etiket[l]}
            </Etiket>
          </li>
        ))}
      </ul>
      <h3 id={baslikId} className={styles.kartBaslik}>
        {x.title}
      </h3>
      <p className={`${styles.kunye} kz-mono`}>
        {kunye(r).join(' · ')}
        {x.status !== 'bilinmiyor' ? ` · ${ara.durum[x.status]}` : ''}
        {` · ${doldur(ara.sonuc.ulke, { ulke: x.jurisdiction })}`}
      </p>
      <p className={styles.neden}>
        <span className={styles.nedenBaslik}>{ara.sonuc.neden.baslik}: </span>
        {neden(r)}
      </p>
      {r.chunk || x.text ? <p className={styles.alinti}>{snippet(r.chunk?.text ?? x.text)}</p> : null}
      {/* An old source in force says so in its status; the check reminder is for the others (SRS 3.3). */}
      {r.labels.includes('eski') && x.status !== 'yururlukte' ? (
        <p className={styles.uyariMetni}>{ara.sonuc.eskiUyari}</p>
      ) : null}
      <p className={styles.veriGunu}>{doldur(ara.sonuc.veriGunu, { tarih: tarihTr(x.fetchedAt) ?? '' })}</p>
      <div className={styles.eylemler}>
        <a className={styles.eylem} href={x.sourceUrl} target="_blank" rel="noopener noreferrer">
          {ara.sonuc.kaynagaGit}
          <span className="kz-gorunmez">: {doldur(ara.sonuc.kaynagaGitEtiket, { baslik: x.title })}</span>
        </a>
        {x.liveOnly ? null : (
          <KaydetDugmesi recordId={x.id} girisVar={girisVar} baslik={x.title} baslikId={baslikId} />
        )}
      </div>
    </article>
  );
}
