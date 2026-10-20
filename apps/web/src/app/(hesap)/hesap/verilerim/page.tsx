import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

const s = tr.sayfa.veri;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** Minimal skeleton; forms and client side Better Auth calls come with the on-yuz components. */
export default function VerilerimPage() {
  return (
    <main>
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
    </main>
  );
}
