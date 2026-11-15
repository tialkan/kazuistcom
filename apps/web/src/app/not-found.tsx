import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { Bulunamadi } from './(kabuk)/_kabuk/Bulunamadi.tsx';

/**
 * 404 for unmatched URLs, notFound() calls and the modules production does not show yet (yayin.ts). Next.js
 * adds noindex itself; the title follows the root template ("... | Kazuist").
 */
export const metadata: Metadata = { title: ortak().durum.bulunamadiBaslik };

export default function NotFound() {
  return <Bulunamadi />;
}
