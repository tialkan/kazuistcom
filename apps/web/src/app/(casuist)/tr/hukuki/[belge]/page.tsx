import { permanentRedirect } from 'next/navigation';
import { legalEslesme } from '../../../_bilesen/veri.ts';

/**
 * Safety net only. Ek H asks for a single 301 from /tr/hukuki/* to /hukuki/*, which belongs in
 * next.config.ts (docs/istekler/on-yuz-yonlendirme.md). Config redirects run before routes, so once
 * that lands this page is never reached. permanentRedirect answers 308.
 */
export const dynamicParams = false;
export const generateStaticParams = () => Object.values(legalEslesme).map((belge) => ({ belge }));

export default async function EskiHukuki({ params }: { params: Promise<{ belge: string }> }) {
  const { belge } = await params;
  permanentRedirect(`/hukuki/${belge}`);
}
