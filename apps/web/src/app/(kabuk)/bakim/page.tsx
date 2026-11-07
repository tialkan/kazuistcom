import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { Yukleniyor } from '@kazuist/ui';

const t = ortak();
export const metadata: Metadata = {
  title: `${t.durum.bakimBaslik} | ${t.marka}`,
  robots: { index: false, follow: false },
};

/**
 * In-app maintenance page. During a full outage infra/maintenance/index.html (altyapi) is served
 * instead; that static page should follow the same text and tokens.
 */
export default function BakimSayfasi() {
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{t.durum.bakimBaslik}</h1>
        <p className="sayfa-ust__giris">{t.durum.bakimAciklama}</p>
      </header>
      <Yukleniyor metin={t.durum.bakimDurum} satir={2} />
    </div>
  );
}
