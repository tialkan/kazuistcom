'use client';
import '@kazuist/ui/tokens.css';
import '@kazuist/ui/fonts.css';
import '@kazuist/ui/components.css';
import { ortak } from '@kazuist/i18n';
import { HataGovdesi } from './(kabuk)/_kabuk/HataGovdesi.tsx';

/**
 * Last resort boundary: replaces the root layout when the layout itself fails, so it renders its own document,
 * styles and title (metadata exports are not supported here). The shell is left out on purpose: it may be the
 * part that failed.
 */
export default function GenelHata({ error, retry }: { error: unknown; retry: () => void }) {
  const t = ortak();
  return (
    <html lang="tr">
      <body>
        <title>{`${t.durum.hataBaslik} | ${t.marka}`}</title>
        <main id="icerik" className="kabuk-icerik">
          <HataGovdesi error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}
