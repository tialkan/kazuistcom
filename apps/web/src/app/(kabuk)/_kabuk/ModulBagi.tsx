import Link from 'next/link';
import type { ReactNode } from 'react';
import { ortak } from '@kazuist/i18n';
import { modulAcik } from './rotalar.ts';

/** Link to a module when it is open; otherwise the name with a visible "yakında" marker and no link. */
export function ModulBagi({
  href,
  children,
  className,
  current,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  current?: boolean;
}) {
  if (modulAcik(href))
    return (
      <Link href={href} className={className} aria-current={current ? 'page' : undefined}>
        {children}
      </Link>
    );
  return (
    <span className={`${className ?? ''} modul-kapali`.trim()}>
      {children} <span className="modul-kapali__not">{ortak('tr').gezinme.yakinda}</span>
    </span>
  );
}
