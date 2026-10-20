import { ortak } from '@kazuist/i18n';
import { CasuistSayfa, casuistMetadata } from '../_bilesen/CasuistSayfa.tsx';

/** Previous site archive (Ek H row 23): kept, noindex. */
export const metadata = casuistMetadata('eski', { robots: { index: false, follow: true } });

export default function EskiSayfa() {
  return (
    <CasuistSayfa
      anahtar="eski"
      ust={
        <p className="casuist-not" lang="tr">
          {ortak('tr').casuist.eskiNot}
        </p>
      }
    />
  );
}
