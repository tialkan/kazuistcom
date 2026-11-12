import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import styles from '../_bilesen/hesap.module.css';
import { ParolaSifirlama } from '../_bilesen/ParolaSifirlama';

const s = tr.sayfa.parola;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** Password reset by e-mail code; open to signed out visitors. */
export default function ParolaSifirlaPage() {
  return (
    <section className={`sayfa ${styles.alt}`}>
      <header className="sayfa-ust">
        <h1>{s.baslik}</h1>
        <p className="sayfa-ust__giris">{s.aciklama}</p>
      </header>
      <ParolaSifirlama />
    </section>
  );
}
