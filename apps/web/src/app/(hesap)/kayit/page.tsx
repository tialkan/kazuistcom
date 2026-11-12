import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { currentRequiredConsents } from '@/server/auth/account-view';
import { pageSession } from '@/server/auth/page-session';
import styles from '../_bilesen/hesap.module.css';
import { HesapFormu, type KayitRizalari } from '../_bilesen/HesapFormu';

const s = tr.sayfa.kayit;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** The app shell renders the single <main>; module pages open a section (on-yuz note). */
export default async function KayitPage() {
  if (await pageSession()) redirect('/hesap');
  // The versions shown here are the ones written to consents.version after sign up.
  const rizalar = Object.fromEntries(
    currentRequiredConsents().map((c) => [c.kind, c.version]),
  ) as unknown as KayitRizalari;
  return (
    <section className={`sayfa ${styles.alt}`}>
      <header className="sayfa-ust">
        <h1>{s.baslik}</h1>
        <p className="sayfa-ust__giris">{s.aciklama}</p>
      </header>
      <HesapFormu kind="kayit" sonra="/hesap" rizalar={rizalar} />
    </section>
  );
}
