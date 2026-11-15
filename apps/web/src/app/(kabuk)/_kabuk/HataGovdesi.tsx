'use client';
import { ortak } from '@kazuist/i18n';
import { Dugme, HataDurumu } from '@kazuist/ui';

/**
 * Error body shared by app/error.tsx (inside the shell) and app/global-error.tsx (own document). It never shows
 * the error message or a stack (wt.65); only the digest, the id Next.js also writes to the server log, so a
 * user can quote it to support.
 */
export function HataGovdesi({ error, retry }: { error: unknown; retry: () => void }) {
  const t = ortak();
  const digest =
    error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string'
      ? error.digest
      : null;
  return (
    <div className="sayfa">
      <h1 className="kz-gorunmez">{t.durum.hataBaslik}</h1>
      <HataDurumu
        baslik={t.durum.hataBaslik}
        aciklama={
          <>
            <p>{t.durum.hataAciklama}</p>
            {digest ? (
              <p>
                {t.durum.hataKodu}: <span className="kz-mono">{digest}</span>
              </p>
            ) : null}
          </>
        }
        eylem={
          <>
            <Dugme onClick={() => retry()}>{t.durum.yenidenDene}</Dugme>
            <Dugme href="/" tur="ikincil">
              {t.durum.anaSayfaya}
            </Dugme>
          </>
        }
      />
    </div>
  );
}
