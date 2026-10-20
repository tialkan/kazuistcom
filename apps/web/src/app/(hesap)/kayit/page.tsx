import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

const s = tr.sayfa.kayit;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** Minimal skeleton; forms and client side Better Auth calls come with the on-yuz components. */
export default function KayitPage() {
  return (
    <main>
      <h1>{s.baslik}</h1>
      <p>{s.aciklama}</p>
    </main>
  );
}
