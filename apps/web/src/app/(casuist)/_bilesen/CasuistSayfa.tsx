import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ortak } from '@kazuist/i18n';
import { DugumGoster } from './Dugum.tsx';
import { casuistSayfalari, type CasuistAnahtari } from './veri.ts';
import './casuist.css';

export function casuistMetadata(anahtar: CasuistAnahtari, ek: Partial<Metadata> = {}): Metadata {
  const s = casuistSayfalari[anahtar];
  return { title: s.title, description: s.description, ...ek };
}

/**
 * Protected Casuist page (Ek H): the archived text verbatim inside the new design system,
 * with the original section navigation. Only company particulars and legal links are updated.
 */
export function CasuistSayfa({
  anahtar,
  ust,
  gezinmesiz = false,
}: {
  anahtar: CasuistAnahtari;
  ust?: ReactNode;
  /** Hide the Casuist section navigation (product legal pages reuse the archived text). */
  gezinmesiz?: boolean;
}) {
  const s = casuistSayfalari[anahtar];
  const dil = s.lang === 'tr' ? 'tr' : 'en';
  const t = ortak(dil);
  const ev = dil === 'tr' ? '/tr' : '/en';
  const metin = { yerTutucu: t.casuist.gorselYerTutucu, gorselAlt: t.casuist.gorselAlt };
  return (
    <div lang={dil} className="casuist">
      {s.nav.length > 0 && !gezinmesiz ? (
        <div className="casuist-ust">
          <div className="casuist-ust__ic">
            <Link href={ev} className="casuist-marka">
              Casuist
            </Link>
            <nav aria-label={t.casuist.ustBilgi}>
              <ul>
                {s.nav.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} aria-current={n.href === s.path ? 'page' : undefined}>
                      {n.text}
                    </Link>
                  </li>
                ))}
                {s.langLink ? (
                  <li>
                    <Link href={s.langLink.href} hrefLang={s.langLink.hreflang} lang={s.langLink.hreflang}>
                      {s.langLink.text}
                    </Link>
                  </li>
                ) : null}
              </ul>
            </nav>
          </div>
        </div>
      ) : null}
      <div className="casuist-govde">
        {ust}
        {s.main.map((d, i) => (
          <DugumGoster key={i} dugum={d} metin={metin} />
        ))}
        {s.tagline ? <p className="casuist-alt">{s.tagline}</p> : null}
      </div>
    </div>
  );
}
