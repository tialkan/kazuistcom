'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ortak } from '@kazuist/i18n';
import { etkinMi, moduller } from './rotalar.ts';

/** Module tabs. Client side only to mark the current section with aria-current. */
export function ModulGezinmesi() {
  const path = usePathname() ?? '/';
  const t = ortak();
  return (
    <nav className="kabuk-moduller" aria-label={t.gezinme.moduller}>
      <ul>
        {moduller.map((m) => {
          const etkin = etkinMi(path, m.href);
          return (
            <li key={m.href}>
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
