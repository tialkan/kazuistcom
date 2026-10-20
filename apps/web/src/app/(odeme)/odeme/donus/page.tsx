import odeme from '@kazuist/i18n/tr/odeme.json';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: odeme.donus.baslik, robots: { index: false, follow: false } };

/**
 * iyzico callback landing. The result is never read from the query string: the server re-queries the
 * token at iyzico (BillingService.completeCheckout) before any credit is granted.
 */
export default function OdemeDonusPage() {
  return (
    <main>
      <h1>{odeme.donus.baslik}</h1>
      <p aria-live="polite">{odeme.donus.kontrol}</p>
    </main>
  );
}
