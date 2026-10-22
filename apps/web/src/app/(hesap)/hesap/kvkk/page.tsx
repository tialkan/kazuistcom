import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

const s = tr.sayfa.kvkk;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** The app shell renders the single <main>; module pages open a section (on-yuz note). */
export default function KvkkPage() {
  return (
    <section>
      <h1>{s.baslik}</h1>
      <p>{s.aciklama}</p>
    </section>
  );
}
