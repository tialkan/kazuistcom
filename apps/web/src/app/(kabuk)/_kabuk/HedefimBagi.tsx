import Link from 'next/link';
import { hedefimGorunumu, type KabukOturumu } from './oturum.ts';

/** The Hedefim link of the top bar for a known session state. */
export function HedefimBagi({ oturum }: { oturum: KabukOturumu | null }) {
  const g = hedefimGorunumu(oturum);
  return (
    <Link href={g.href} className="kabuk-hedefim" title={g.baslik}>
      <span
        className={`kabuk-hedefim__avatar${g.bas ? ' kabuk-hedefim__avatar--oturum' : ''}`}
        aria-hidden="true"
      >
        {g.bas}
      </span>
      <span className="kabuk-hedefim__metin">
        <span className="kabuk-hedefim__etiket">{g.ust}</span> <span>{g.alt}</span>
      </span>
    </Link>
  );
}
