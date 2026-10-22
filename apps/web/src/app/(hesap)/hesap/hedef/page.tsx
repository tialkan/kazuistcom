import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { listProfessions } from '@/server/auth/professions';

const s = tr.sayfa.hedef;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** Profession list from the same source as GET /v1/professions; the picker posts to /v1/me/target-profession. */
export default function HedefPage() {
  return (
    <section>
      <h1>{s.baslik}</h1>
      <p>{s.aciklama}</p>
      <ul>
        {listProfessions().map((p) => (
          <li key={p.id}>{p.label}</li>
        ))}
      </ul>
    </section>
  );
}
