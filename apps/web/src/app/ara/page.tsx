import type { Metadata } from 'next';
import { authorityClasses, recordTypes, SearchQuery, type RecordType } from '@kazuist/contracts';
import ara from '@kazuist/i18n/tr/ara.json';
import { BosDurum, Dugme, Etiket, FormAlani, HataDurumu } from '@kazuist/ui';
import { formatNorm, type SearchResult } from '@kazuist/casuist';
import { logError } from '@kazuist/log';
import { araAdresi, doldur, donusAdresi, girisAdresi } from './_bilesen/metin.ts';
import { KisitliArama } from './_bilesen/KisitliArama.tsx';
import { OzetAlani } from './_bilesen/OzetAlani.tsx';
import { SonucKarti } from './_bilesen/SonucKarti.tsx';
import { runSearch } from './_sunucu/arama.ts';
import { getSearchDeps, SearchUnavailable, type CorpusSource } from './_sunucu/baglam.ts';
import { oturum } from './_sunucu/oturum.ts';
import styles from './ara.module.css';

export const metadata: Metadata = {
  title: ara.meta.baslik,
  description: ara.meta.aciklama,
};

type Params = Record<string, string | string[] | undefined>;
const KEYS = ['q', 'type', 'sort', 'page', 'from', 'to', 'court', 'authority'] as const;
/** Types offered as tabs (FR-09: Tümü, Mevzuat, Mahkeme kararı, Kurum kararı, Makale ve tez, plus EU law). */
const SEKMELER: RecordType[] = ['mevzuat', 'karar', 'kurul_karari', 'ab_hukuku', 'makale', 'tez'];

function tekDeger(p: Params): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of KEYS) {
    const v = p[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    if (s) out[k] = s;
  }
  return out;
}

const resmiSiteler = (q: string) => [
  { ad: ara.resmi.scholar, href: `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}` },
  { ad: ara.resmi.dergipark, href: `https://dergipark.org.tr/tr/search?q=${encodeURIComponent(q)}` },
  { ad: ara.resmi.yoktez, href: 'https://tez.yok.gov.tr/UlusalTezMerkezi/' },
  { ad: ara.resmi.uyap, href: 'https://emsal.uyap.gov.tr/' },
  { ad: ara.resmi.aym, href: 'https://kararlarbilgibankasi.anayasa.gov.tr/' },
  { ad: ara.resmi.yargitay, href: 'https://karararama.yargitay.gov.tr/' },
  { ad: ara.resmi.danistay, href: 'https://karararama.danistay.gov.tr/' },
];

function Arama({ v }: { v: Record<string, string> }) {
  const filtreVar = Boolean(v.from || v.to || v.court || v.authority || (v.sort && v.sort !== 'ilgililik'));
  return (
    <form className={styles.form} action="/ara" method="get" role="search">
      <div className={styles.formSatir}>
        <FormAlani
          id="q"
          name="q"
          type="search"
          etiket={ara.form.etiket}
          ipucu={ara.form.ipucu}
          defaultValue={v.q ?? ''}
          maxLength={500}
          autoComplete="off"
          required
          className={styles.formAlan}
        />
        <Dugme type="submit">{ara.form.dugme}</Dugme>
      </div>
      {v.type ? <input type="hidden" name="type" value={v.type} /> : null}
      <details className={styles.filtreler} open={filtreVar}>
        <summary>{ara.form.filtreler}</summary>
        <div className={styles.filtreIzgara}>
          <div className="kz-alan">
            <label className="kz-alan__etiket" htmlFor="sort">
              {ara.form.siralama}
            </label>
            <select id="sort" name="sort" className="kz-alan__girdi" defaultValue={v.sort ?? 'ilgililik'}>
              {(['ilgililik', 'onem', 'tarih_yeni', 'tarih_eski'] as const).map((s) => (
                <option key={s} value={s}>
                  {ara.sirala[s]}
                </option>
              ))}
            </select>
          </div>
          <FormAlani
            id="from"
            name="from"
            type="date"
            etiket={ara.form.tarihBaslangic}
            defaultValue={v.from ?? ''}
          />
          <FormAlani id="to" name="to" type="date" etiket={ara.form.tarihBitis} defaultValue={v.to ?? ''} />
          <FormAlani
            id="court"
            name="court"
            etiket={ara.form.mahkeme}
            ipucu={ara.form.mahkemeIpucu}
            defaultValue={v.court ?? ''}
            maxLength={100}
          />
          <div className="kz-alan">
            <label className="kz-alan__etiket" htmlFor="authority">
              {ara.form.otorite}
            </label>
            <select
              id="authority"
              name="authority"
              className="kz-alan__girdi"
              defaultValue={v.authority ?? ''}
            >
              <option value="">{ara.form.tumOtoriteler}</option>
              {authorityClasses.map((a) => (
                <option key={a} value={a}>
                  {ara.otorite[a]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.filtreEylem}>
          <Dugme type="submit" tur="ikincil">
            {ara.form.uygula}
          </Dugme>
          {filtreVar ? (
            <a className={styles.eylem} href={araAdresi({ q: v.q, type: v.type })}>
              {ara.form.temizle}
            </a>
          ) : null}
        </div>
      </details>
    </form>
  );
}

function Sekmeler({ v, res }: { v: Record<string, string>; res: SearchResult }) {
  const temel = { ...v, page: undefined };
  const sekme = (type: string | undefined, ad: string, sayi: number) => {
    const etkin = (v.type ?? '') === (type ?? '');
    return (
      <li key={type ?? 'tumu'}>
        <a
          href={araAdresi({ ...temel, type })}
          className={etkin ? styles.sekmeEtkin : styles.sekme}
          aria-current={etkin ? 'page' : undefined}
        >
          {ad} <span className={styles.sayi}>{sayi}</span>
        </a>
      </li>
    );
  };
  return (
    <nav aria-label={ara.tur.baslik}>
      <ul className={styles.sekmeler}>
        {sekme(undefined, ara.tur.tumu, res.counts.tumu)}
        {SEKMELER.filter((t) => (res.counts[t] ?? 0) > 0 || v.type === t).map((t) =>
          sekme(t, ara.tur[t], res.counts[t] ?? 0),
        )}
      </ul>
    </nav>
  );
}

function Sayfalama({ v, res }: { v: Record<string, string>; res: SearchResult }) {
  const sayfalar = Math.max(1, Math.ceil(res.total / res.pageSize));
  if (sayfalar <= 1) return null;
  return (
    <nav className={styles.sayfalama} aria-label={ara.sonuc.sayfalama}>
      {res.page > 1 ? (
        <a className={styles.eylem} href={araAdresi({ ...v, page: res.page - 1 })} rel="prev">
          {ara.sonuc.onceki}
        </a>
      ) : null}
      <span>{doldur(ara.sonuc.sayfa, { sayfa: res.page, sayfalar })}</span>
      {res.page < sayfalar ? (
        <a className={styles.eylem} href={araAdresi({ ...v, page: res.page + 1 })} rel="next">
          {ara.sonuc.sonraki}
        </a>
      ) : null}
    </nav>
  );
}

function Bilgiler({ q, kaynak }: { q: string | undefined; kaynak: CorpusSource | null }) {
  const etiketler = [
    ['yeni', ara.etiketler.yeni],
    ['yerlesik', ara.etiketler.yerlesik],
    ['eski', ara.etiketler.eski],
    ['oncu', ara.etiketler.oncu],
    ['anonim', ara.etiketler.anonimlestirildi],
    ['ilgililik', ara.etiketler.ilgililik],
    ['guncellik', ara.etiketler.guncellik_uyarisi],
    ['canli', ara.etiketler.canli_kaynak],
    ['veri-gunu', ara.etiketler.veri_gunu],
  ] as const;
  const adlar: Record<(typeof etiketler)[number][0], string> = {
    yeni: ara.etiket.yeni,
    yerlesik: ara.etiket.yerlesik,
    eski: ara.etiket.eski,
    oncu: ara.etiket.oncu,
    anonim: ara.etiket.anonimlestirildi,
    ilgililik: ara.etiket.ilgililik_yuksek,
    guncellik: ara.etiket.guncellik_uyarisi,
    canli: ara.etiket.canli_kaynak,
    'veri-gunu': ara.etiket.veri_gunu,
  };
  return (
    <div className={styles.bilgiler}>
      {q ? (
        <section aria-labelledby="resmi-baslik" className={styles.resmi}>
          <h2 id="resmi-baslik">{ara.resmi.baslik}</h2>
          <p>{ara.resmi.aciklama}</p>
          <ul>
            {resmiSiteler(q).map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer">
                  {s.ad}
                  <span className="kz-gorunmez"> ({ara.resmi.yeniSekme})</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <details className={styles.acilir}>
        <summary>{ara.etiketler.baslik}</summary>
        <dl className={styles.etiketSozluk}>
          {etiketler.map(([tur, aciklama]) => (
            <div key={tur}>
              <dt>
                <Etiket tur={tur}>{adlar[tur]}</Etiket>
              </dt>
              <dd>{aciklama}</dd>
            </div>
          ))}
          <div>
            <dt>{ara.sonuc.otoriteEtiket}</dt>
            <dd>{ara.etiketler.otorite}</dd>
          </div>
        </dl>
      </details>
      <details className={styles.acilir}>
        <summary>{ara.taranan.baslik}</summary>
        {kaynak === 'fikstur' ? (
          // The fixture corpus is not what the connectors collect: say what it holds instead.
          <p>{ara.fikstur.metin}</p>
        ) : (
          <>
            <p>{ara.taranan.aciklama}</p>
            {/* One line per connector in services/worker-py/connectors that writes records; none for court
                decisions yet, so no court is listed. */}
            <ul>
              <li>{ara.taranan.mevzuat}</li>
              <li>{ara.taranan.kvkk}</li>
              <li>{ara.taranan.rekabet}</li>
              <li>{ara.taranan.eurlex}</li>
              <li>{ara.taranan.akademik}</li>
            </ul>
          </>
        )}
      </details>
    </div>
  );
}

/** /ara (plan 13.1): search, filters, results with labels and the sourced summary. */
export default async function AraSayfasi({ searchParams }: { searchParams: Promise<Params> }) {
  const v = tekDeger(await searchParams);
  const kaynak: CorpusSource | null = await getSearchDeps().then(
    (d) => d.source,
    () => null,
  );
  const ust = (
    <header className="sayfa-ust">
      <h1>{ara.baslik}</h1>
      <p className="sayfa-ust__giris">{ara.giris}</p>
      {kaynak === 'fikstur' ? (
        <p className={styles.fikstur}>
          <strong>{ara.fikstur.baslik}: </strong>
          {ara.fikstur.metin}
        </p>
      ) : null}
    </header>
  );

  if (!v.q) {
    const ornekler = [ara.bos.ornek['1'], ara.bos.ornek['2'], ara.bos.ornek['3'], ara.bos.ornek['4']];
    return (
      <div className="sayfa">
        {ust}
        <Arama v={v} />
        <BosDurum
          baslik={ara.bos.baslik}
          aciklama={
            <>
              <p>{ara.bos.aciklama}</p>
              <h3 className={styles.altBaslik}>{ara.bos.ornekler}</h3>
              <ul className={styles.ornekler}>
                {ornekler.map((o) => (
                  <li key={o}>
                    <a href={araAdresi({ q: o })}>{o}</a>
                  </li>
                ))}
              </ul>
            </>
          }
        />
        <Bilgiler q={undefined} kaynak={kaynak} />
      </div>
    );
  }

  const parsed = SearchQuery.safeParse(v);
  if (!parsed.success || (v.type && !(recordTypes as readonly string[]).includes(v.type))) {
    return (
      <div className="sayfa">
        {ust}
        <Arama v={v} />
        <HataDurumu baslik={ara.hata.baslik} aciklama={<p>{ara.hata.gecersiz}</p>} />
      </div>
    );
  }

  let res: SearchResult;
  try {
    res = await runSearch({ ...parsed.data });
  } catch (e) {
    if (!(e instanceof SearchUnavailable)) logError('ara', e);
    return (
      <div className="sayfa">
        {ust}
        <Arama v={v} />
        <HataDurumu baslik={ara.hata.baslik} aciklama={<p>{ara.hata.kullanilamaz}</p>} />
      </div>
    );
  }
  const { principal } = await oturum();
  const girisVar = Boolean(principal);
  // After sign in the visitor comes back to this very search (safeNext checks the path on /giris).
  const giris = girisAdresi(donusAdresi(v));

  return (
    <div className="sayfa">
      {ust}
      <Arama v={v} />
      {res.query.norms.length ? (
        <p className={styles.tanima}>
          <span>{ara.sonuc.tanima}: </span>
          {res.query.norms.map((n) => (
            <span key={formatNorm(n)} className={`${styles.atif} kz-mono`}>
              {formatNorm(n)}
            </span>
          ))}
        </p>
      ) : null}
      <OzetAlani
        key={`${v.q}|${v.type ?? ''}|${v.from ?? ''}|${v.to ?? ''}|${v.court ?? ''}`}
        q={v.q}
        filtreler={{
          ...(parsed.data.type ? { type: parsed.data.type } : {}),
          ...(parsed.data.from ? { from: parsed.data.from } : {}),
          ...(parsed.data.to ? { to: parsed.data.to } : {}),
          ...(parsed.data.court ? { court: parsed.data.court } : {}),
        }}
        girisVar={girisVar}
        girisAdresi={giris}
        gorunenKayitlar={res.items.map((r) => r.record.id)}
      />
      <section aria-labelledby="sonuc-baslik" className={styles.sonuclar}>
        <div className={styles.sonucUst}>
          <h2 id="sonuc-baslik">{ara.sonuc.baslik}</h2>
          <p className={styles.sayiMetni}>{doldur(ara.sonuc.sayi, { toplam: res.total })}</p>
        </div>
        <KisitliArama degraded={res.degraded} />
        <Sekmeler v={v} res={res} />
        {res.items.length ? (
          <ol className={styles.liste} start={(res.page - 1) * res.pageSize + 1}>
            {res.items.map((r) => (
              <li key={r.record.id}>
                <SonucKarti r={r} girisVar={girisVar} girisAdresi={giris} />
              </li>
            ))}
          </ol>
        ) : (
          <BosDurum baslik={ara.bos.sonucYok} aciklama={<p>{ara.bos.sonucYokAciklama}</p>} />
        )}
        <Sayfalama v={v} res={res} />
      </section>
      {res.live.length ? (
        <section aria-labelledby="canli-baslik" className={styles.sonuclar}>
          <h2 id="canli-baslik">{ara.canli.baslik}</h2>
          <p>{ara.canli.aciklama}</p>
          <ol className={styles.liste}>
            {res.live.map((r) => (
              <li key={r.record.id}>
                <SonucKarti r={r} girisVar={girisVar} girisAdresi={giris} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <Bilgiler q={v.q} kaynak={kaynak} />
    </div>
  );
}
