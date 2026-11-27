import type { Metadata } from 'next';
import Link from 'next/link';
import { ortak } from '@kazuist/i18n';
import { Sahne } from './_karsilama/Sahne.tsx';

const t = ortak().karsilama;

// The home title already carries the brand, so it skips the "%s | Kazuist" template of the root layout.
export const metadata: Metadata = { title: { absolute: t.baslik }, description: t.aciklama };

/** Pre-launch welcome screen: one scene, one call to action that leads to the launch countdown. */
export default function Home() {
  return (
    <Sahne
      secenek={{ kelime: true, gunes: 'kaydir' }}
      logoAlt={t.logo}
      ust={
        <Link className="kzw-cta" href="/lansman">
          {t.cta}
        </Link>
      }
    >
      <h1 className="kzw-gizli">{t.baslik}</h1>
    </Sahne>
  );
}
