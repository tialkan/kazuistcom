import Link from 'next/link';
import type { ReactNode } from 'react';
import { ortak } from '@kazuist/i18n';
import { kunye } from './kunye.ts';
import { ModulBagi } from './ModulBagi.tsx';
import { ModulGezinmesi } from './ModulGezinmesi.tsx';
import { hukukiBelgeler, moduller } from './rotalar.ts';
import './kabuk.css';

/** Product shell: skip link, top bar, Hedefim slot, module tabs, footer with company particulars. */
export function Kabuk({ children }: { children: ReactNode }) {
  const t = ortak('tr');
  return (
    <>
      <a className="kz-atla" href="#icerik">
        {t.atla}
      </a>
      <header className="kabuk-ust">
        <div className="kabuk-ust__ic">
          <Link href="/" className="kabuk-marka" aria-label={t.gezinme.anaSayfa}>
            <span className="kabuk-marka__serh" aria-hidden="true" />
            {t.marka}
          </Link>
          <nav className="kabuk-ust__bag" aria-label={t.gezinme.ana}>
            <Link href="/fiyatlar">{t.gezinme.fiyatlar}</Link>
            <Link href="/tr">{t.gezinme.arge}</Link>
          </nav>
          <Link href="/hesap" className="kabuk-hedefim" title={t.hedefim.aciklama}>
            <span className="kabuk-hedefim__avatar" aria-hidden="true" />
            <span className="kabuk-hedefim__metin">
              <span className="kabuk-hedefim__etiket">{t.hedefim.etiket}</span>
              <span>{t.hedefim.secilmedi}</span>
            </span>
          </Link>
        </div>
        <ModulGezinmesi />
      </header>
      <main id="icerik" tabIndex={-1} className="kabuk-icerik">
        {children}
      </main>
      <footer className="kabuk-alt" aria-label={t.altBilgi.etiket}>
        <div className="kabuk-alt__ic">
          <div className="kabuk-alt__marka">
            <p className="kabuk-alt__ad">{t.marka}</p>
            <p>{t.amac}</p>
            <p className="kabuk-alt__uyari">{t.uyari.intihal}</p>
            <p className="kabuk-alt__uyari">{t.uyari.danismanlik}</p>
          </div>
          <nav aria-label={t.altBilgi.urun}>
            <h2>{t.altBilgi.urun}</h2>
            <ul>
              {moduller.map((m) => (
                <li key={m.href}>
                  <ModulBagi href={m.href}>{t.gezinme.sekme[m.anahtar]}</ModulBagi>
                </li>
              ))}
              <li>
                <Link href="/tespit">{t.gezinme.tespit}</Link>
              </li>
              <li>
                <Link href="/fiyatlar">{t.gezinme.fiyatlar}</Link>
              </li>
            </ul>
          </nav>
          <nav aria-label={t.altBilgi.hukuki}>
            <h2>{t.altBilgi.hukuki}</h2>
            <ul>
              {hukukiBelgeler.map((b) => (
                <li key={b}>
                  <Link href={`/hukuki/${b}`}>{t.hukuki.belge[b]}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <nav aria-label={t.altBilgi.arge}>
              <h2>{t.altBilgi.arge}</h2>
              <ul>
                <li>
                  <Link href="/tr">{t.altBilgi.casuistTr}</Link>
                </li>
                <li lang="en">
                  <Link href="/en">{t.altBilgi.casuistEn}</Link>
                </li>
              </ul>
            </nav>
            <h2>{t.altBilgi.kunye}</h2>
            <dl className="kabuk-kunye">
              <dt className="kz-gorunmez">{t.altBilgi.kunye}</dt>
              <dd>{kunye.tamUnvan}</dd>
              <dt>{t.altBilgi.mersis}</dt>
              <dd className="kz-mono">{kunye.mersis}</dd>
              <dt>{t.altBilgi.sicil}</dt>
              <dd>{kunye.sicil}</dd>
              <dt>{t.altBilgi.adres}</dt>
              <dd>{kunye.adres}</dd>
              <dt>{t.altBilgi.eposta}</dt>
              <dd>
                <a href={`mailto:${kunye.eposta}`}>{kunye.eposta}</a>
              </dd>
              <dt>{t.altBilgi.telefon}</dt>
              <dd>
                <a href={`tel:${kunye.telefon.replace(/\s/g, '')}`}>{kunye.telefon}</a>
              </dd>
            </dl>
          </div>
        </div>
        <p className="kabuk-alt__telif">
          © {new Date().getFullYear()} {t.altBilgi.telif}
        </p>
      </footer>
    </>
  );
}
