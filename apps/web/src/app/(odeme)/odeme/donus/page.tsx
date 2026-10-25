import odeme from '@kazuist/i18n/tr/odeme.json';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: odeme.donus.baslik, robots: { index: false, follow: false } };

/**
 * Landing after the iyzico callback. The callback route already re-queried the token server side; the
 * query string carries only the outcome flag it set, never payment data.
 */
export default async function OdemeDonusPage(props: { searchParams: Promise<{ durum?: string }> }) {
  const { durum } = await props.searchParams;
  const text =
    durum === 'basarili'
      ? odeme.donus.basarili
      : durum === 'basarisiz'
        ? odeme.donus.basarisiz
        : odeme.donus.kontrol;
  return (
    <div className="sayfa">
      <h1>{odeme.donus.baslik}</h1>
      <p aria-live="polite">{text}</p>
    </div>
  );
}
