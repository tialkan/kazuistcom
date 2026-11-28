import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/kazu.json';
import { YazimMasasi } from './_bilesen/YazimMasasi.tsx';
import './kazu.css';

// Reachable by link, not linked from the welcome page yet; no index until launch.
export const metadata: Metadata = {
  title: tr.baslik,
  description: tr.aciklama,
  robots: { index: false, follow: false },
};

/** /kazu: every writing job starts here (ADR-0040). A plain text tool, no scene. */
export default function Kazu() {
  return <YazimMasasi />;
}
