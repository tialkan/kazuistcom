import Link from 'next/link';
import type { ReactNode } from 'react';
import { ortak } from '@kazuist/i18n';
import type { Blok, Satir } from './md.ts';
import type { HukukiMetin } from './yukle.ts';
import './hukuki.css';

function SatirGoster({ c }: { c: Satir[] }): ReactNode {
  return c.map((s, i) => {
    switch (s.t) {
      case 'metin':
        return s.v;
      case 'kod':
        return (
          <code key={i} className="kz-mono">
            {s.v}
          </code>
        );
      case 'kalin':
        return (
          <strong key={i}>
            <SatirGoster c={s.c} />
          </strong>
        );
      case 'egik':
        return (
          <em key={i}>
            <SatirGoster c={s.c} />
          </em>
        );
      case 'bag':
        return s.href.startsWith('/') ? (
          <Link key={i} href={s.href}>
            <SatirGoster c={s.c} />
          </Link>
        ) : (
          <a key={i} href={s.href} rel="noreferrer noopener">
            <SatirGoster c={s.c} />
          </a>
        );
    }
  });
}

export function BlokGoster({ bloklar, tablo }: { bloklar: Blok[]; tablo: string }): ReactNode {
  return bloklar.map((b, i) => {
    switch (b.t) {
      case 'baslik': {
        const H = `h${b.seviye}` as const;
        return (
          <H key={i}>
            <SatirGoster c={b.c} />
          </H>
        );
      }
      case 'paragraf':
        return (
          <p key={i}>
            <SatirGoster c={b.c} />
          </p>
        );
      case 'alinti':
        return (
          <blockquote key={i}>
            <BlokGoster bloklar={b.c} tablo={tablo} />
          </blockquote>
        );
      case 'liste': {
        const ogeler = b.ogeler.map((o, j) => (
          <li key={j}>
            <SatirGoster c={o} />
          </li>
        ));
        return b.sirali ? (
          <ol key={i} start={b.baslangic === 1 ? undefined : b.baslangic}>
            {ogeler}
          </ol>
        ) : (
          <ul key={i}>{ogeler}</ul>
        );
      }
      case 'tablo':
        return (
          <div key={i} className="hukuki-tablo" role="region" tabIndex={0} aria-label={`${tablo} ${i + 1}`}>
            <table>
              {b.baslik ? (
                <thead>
                  <tr>
                    {b.baslik.map((h, j) => (
                      <th key={j} scope="col">
                        <SatirGoster c={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {b.satirlar.map((r, j) => (
                  <tr key={j}>
                    {r.map((h, k) =>
                      k === 0 ? (
                        <th key={k} scope="row">
                          <SatirGoster c={h} />
                        </th>
                      ) : (
                        <td key={k}>
                          <SatirGoster c={h} />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

const tarih = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** Legal text page: title, visible version and date, optional draft band. Turkish only (ADR-0032). */
export function HukukiGovde({ metin, taslak }: { metin: HukukiMetin; taslak: boolean }) {
  const { fm } = metin;
  const t = ortak();
  return (
    <article className="sayfa hukuki-belge">
      {taslak ? (
        <p className="hukuki-taslak" role="note">
          {t.hukuki.taslakBandi}
        </p>
      ) : null}
      <header className="sayfa-ust">
        <p className="ust-etiket">{t.hukuki.ust}</p>
        <h1>{fm.title}</h1>
        <dl className="hukuki-surum">
          <div>
            <dt>{t.hukuki.surum}</dt>
            <dd className="kz-mono">{fm.version}</dd>
          </div>
          <div>
            <dt>{t.hukuki.guncelleme}</dt>
            <dd>
              <time dateTime={fm.date}>{tarih(fm.date)}</time>
            </dd>
          </div>
        </dl>
      </header>
      <div className="hukuki-metin">
        <BlokGoster bloklar={metin.govde} tablo={t.hukuki.tablo} />
      </div>
    </article>
  );
}
