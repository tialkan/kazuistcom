'use client';
import { usePathname } from 'next/navigation';
import { ortak } from '@kazuist/i18n';
import { ModulBagi } from './ModulBagi.tsx';
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
              <ModulBagi href={m.href} current={etkin}>
                {t.gezinme.sekme[m.anahtar]}
              </ModulBagi>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
