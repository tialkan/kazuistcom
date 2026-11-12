import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/yazma.json';
import { SablonAtolyesi } from '../_bilesen/SablonAtolyesi.tsx';
import { doldur } from '../_bilesen/yardimci.ts';
import { yazmaDb } from '../_sunucu/db.ts';
import { dergiyiBul, onayliKurallar } from '../_sunucu/dergiler.ts';
import styles from '../yazma.module.css';

export const metadata: Metadata = {
  title: tr.sablon.meta.baslik,
  description: tr.sablon.meta.aciklama,
};

// ?dergi=<slug> loads the approved rules of a journal into the control screen (FR-42); the page is per request.
export const dynamic = 'force-dynamic';

async function profil(slug: string | undefined) {
  const db = yazmaDb();
  if (!slug || !db) return null;
  try {
    const dergi = await dergiyiBul(db, { slug });
    const kurallar = dergi ? await onayliKurallar(db, dergi.id) : null;
    return dergi && kurallar ? { ad: dergi.name, surum: kurallar.version, kayit: kurallar.kayit } : null;
  } catch {
    return null;
  }
}

export default async function SablonSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ dergi?: string | string[] }>;
}) {
  const sp = await searchParams;
  const slug = (Array.isArray(sp.dergi) ? sp.dergi[0] : sp.dergi)?.slice(0, 120);
  const p = await profil(slug);
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{tr.sablon.baslik}</h1>
        <p className="sayfa-ust__giris">{tr.sablon.giris}</p>
      </header>
      {p ? (
        <p className={styles.kutu}>{doldur(tr.sablon.adim1.profilYuklendi, { ad: p.ad, surum: p.surum })}</p>
      ) : null}
      <SablonAtolyesi key={slug ?? 'bos'} {...(p ? { baslangicKaydi: p.kayit, baslangicAdi: p.ad } : {})} />
    </div>
  );
}
