'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ortak } from '@kazuist/i18n';
import { etkinMi, moduller } from './rotalar.ts';

/** Seven module tabs. Client side only to mark the current section with aria-current. */
export function ModulGezinmesi() {
  const path = usePathname() ?? '/';
  const t = ortak('tr');
  return (
    <nav className="kabuk-moduller" aria-label={t.gezinme.moduller}>
      <ul>
        {moduller.map((m) => {
          const etkin = etkinMi(path, m.href);
          return (
            <li key={m.href} className={m.anahtar === 'kampus' ? 'kabuk-modul--kampus' : undefined}>
              <Link href={m.href} aria-current={etkin ? 'page' : undefined}>
                {t.gezinme.sekme[m.anahtar]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
