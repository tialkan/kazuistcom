'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ortak } from '@kazuist/i18n';
import { etkinMi, moduller } from './rotalar.ts';

type Modul = (typeof moduller)[number];

/**
 * Module tabs. Client side only to mark the current section with aria-current. The shell passes the tabs
 * shown in this environment (yayin.ts); without the prop every tab is listed.
 */
export function ModulGezinmesi({ sekmeler = moduller }: { sekmeler?: readonly Modul[] }) {
  const path = usePathname() ?? '/';
  const t = ortak();
  return (
    <nav className="kabuk-moduller" aria-label={t.gezinme.moduller}>
      <ul>
        {sekmeler.map((m) => {
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
