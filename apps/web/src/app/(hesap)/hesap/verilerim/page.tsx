import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

import styles from './verilerim.module.css';
import { AccountDeletion } from './silme';

const s = tr.sayfa.veri;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** The app shell renders the single <main>; module pages open a section (on-yuz note). */
export default function VerilerimPage() {
  return (
    <section className={styles.page}>
      <h1>{s.baslik}</h1>
      <p>{s.aciklama}</p>
      <ul>
        <li>
          <a href="/api/v1/me/export?format=json">{s.json}</a>
        </li>
        <li>
          <a href="/api/v1/me/export?format=csv">{s.csv}</a>
        </li>
      </ul>
      <AccountDeletion />
    </section>
  );
}
