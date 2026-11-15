import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { modulGorunur } from '../(kabuk)/_kabuk/yayin.ts';

/** Narrowed launch: production answers 404 for every page of this module until yayin.ts opens it. */
export default function PratikYerlesimi({ children }: { children: ReactNode }) {
  if (!modulGorunur('pratik')) notFound();
  return children;
}
