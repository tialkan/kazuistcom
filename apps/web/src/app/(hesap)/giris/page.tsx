import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { pageSession, safeNext } from '@/server/auth/page-session';
import styles from '../_bilesen/hesap.module.css';
import { HesapFormu } from '../_bilesen/HesapFormu';

const s = tr.sayfa.giris;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** The app shell renders the single <main>; module pages open a section (on-yuz note). */
export default async function GirisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sonra = safeNext((await searchParams).sonra);
  if (await pageSession()) redirect(sonra);
  return (
    <section className={`sayfa ${styles.alt}`}>
      <header className="sayfa-ust">
        <h1>{s.baslik}</h1>
        <p className="sayfa-ust__giris">{s.aciklama}</p>
      </header>
      <HesapFormu kind="giris" sonra={sonra} />
    </section>
  );
}
