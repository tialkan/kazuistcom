import Link from 'next/link';
import type { ReactNode } from 'react';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import styles from './hesap.module.css';

/** Frame of an /hesap/* page: link back to /hesap, heading and lead text inside the shell's .sayfa. */
export function AltSayfa({
  baslik,
  aciklama,
  children,
}: {
  baslik: string;
  aciklama: string;
  children: ReactNode;
}) {
  return (
    <section className={`sayfa ${styles.alt}`}>
      <p className={styles.geri}>
        <Link href="/hesap">{tr.sayfa.hesap.geri}</Link>
      </p>
      <header className="sayfa-ust">
        <h1>{baslik}</h1>
        <p className="sayfa-ust__giris">{aciklama}</p>
      </header>
      {children}
    </section>
  );
}
