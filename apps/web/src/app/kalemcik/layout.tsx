import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { modulGorunur } from '../(kabuk)/_kabuk/yayin.ts';

/** Narrowed launch: production answers 404 for this page until yayin.ts opens the module. */
export default function KalemcikYerlesimi({ children }: { children: ReactNode }) {
  if (!modulGorunur('kalemcik')) notFound();
  return children;
}
