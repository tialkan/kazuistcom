import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ortak } from '@kazuist/i18n';
import tr from '@kazuist/i18n/tr/yazma.json';
import { Dugme, Yukleniyor } from '@kazuist/ui';
import { modulGorunur } from '../(kabuk)/_kabuk/yayin.ts';
import { KisaltmaAraci } from './_bilesen/KisaltmaAraci.tsx';
import { yazmaDb } from './_sunucu/db.ts';
import { dergiAra, type DergiOzeti } from './_sunucu/dergiler.ts';
import styles from './yazma.module.css';

export const metadata: Metadata = {
  title: tr.meta.baslik,
  description: tr.meta.aciklama,
};

// Journal profiles come from the database; the page is rendered per request.
export const dynamic = 'force-dynamic';

const h = tr.hub;

async function dergiler(q: string | undefined): Promise<DergiOzeti[]> {
  const db = yazmaDb();
  if (!db) return [];
  try {
    return (await dergiAra(db, q)).filter((d) => d.hasApprovedRules);
  } catch {
    return [];
  }
}

export default async function YazmaSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.slice(0, 200);
  // Narrowed launch: the Kalemcik card is shown only where yayin.ts shows the module.
  const kartlar = [
    { anahtar: 'sablon', href: '/yazma/sablon' },
    { anahtar: 'denetim', href: '/yazma/sablon#denetim' },
    ...(modulGorunur('kalemcik') ? [{ anahtar: 'kalemcik', href: '/kalemcik' } as const] : []),
    { anahtar: 'tespit', href: '/tespit' },
  ] as const;
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{h.baslik}</h1>
        <p className="sayfa-ust__giris">{h.giris}</p>
      </header>

      <ul className={styles.kartlar} role="list">
        {kartlar.map((k) => (
          <li key={k.anahtar} className={styles.kart}>
            <h2 style={{ fontSize: 'var(--kz-text-lg)', margin: 0 }}>{h.kartlar[k.anahtar].baslik}</h2>
            <p>{h.kartlar[k.anahtar].aciklama}</p>
            <div>
              <Dugme href={k.href} tur="ikincil">
                {h.kartlar[k.anahtar].dugme}
              </Dugme>
            </div>
          </li>
        ))}
      </ul>

      <section className={styles.bolum} aria-labelledby="dergiler-baslik">
        <h2 id="dergiler-baslik">{h.dergiler.baslik}</h2>
        <p className={styles.okuma}>{h.dergiler.aciklama}</p>
        <form className={styles.dergiForm} method="get" action="/yazma" role="search">
          <div className="kz-alan">
            <label className="kz-alan__etiket" htmlFor="dergi-ara">
              {h.dergiler.arama}
            </label>
            <input
              id="dergi-ara"
              name="q"
              type="search"
              className="kz-alan__girdi"
              defaultValue={q ?? ''}
              maxLength={200}
            />
          </div>
          <button type="submit" className="kz-dugme kz-dugme--ikincil">
            {h.dergiler.ara}
          </button>
        </form>
        {/* The journal list waits on the database; the rest of the page does not wait for it. */}
        <Suspense key={q ?? ''} fallback={<Yukleniyor metin={ortak().durum.yukleniyor} satir={3} />}>
          <DergiListesi q={q} />
        </Suspense>
      </section>

      <section className={styles.bolum} aria-labelledby="kisaltma-baslik">
        <h2 id="kisaltma-baslik">{h.kisaltma.baslik}</h2>
        <KisaltmaAraci />
      </section>
    </div>
  );
}

async function DergiListesi({ q }: { q: string | undefined }) {
  const liste = await dergiler(q);
  return liste.length ? (
    <ul className={styles.dergiListesi} role="list">
      {liste.map((d) => (
        <li key={d.id}>
          <span>
            <strong>{d.name}</strong>
            {d.issn ? ` (${tr.dergi.issn} ${d.issn})` : ''}
          </span>
          <a href={`/yazma/dergiler/${d.slug}`}>{h.dergiler.profil}</a>
        </li>
      ))}
    </ul>
  ) : (
    <p className={styles.not}>{q ? h.dergiler.sonucYok : h.dergiler.bos}</p>
  );
}
