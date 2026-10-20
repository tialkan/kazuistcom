import odeme from '@kazuist/i18n/tr/odeme.json';
import { PRICE_TABLE_V1, findProduct } from '@kazuist/ledger';
import type { Metadata } from 'next';
import { CheckoutStep } from './checkout-step.tsx';

export const metadata: Metadata = { title: odeme.baslik, robots: { index: false, follow: false } };

const tl = (kurus: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);

export default async function OdemePage(props: { searchParams: Promise<{ urun?: string }> }) {
  const { urun } = await props.searchParams;
  const product =
    findProduct(PRICE_TABLE_V1, urun ?? 'kredi.300') ?? findProduct(PRICE_TABLE_V1, 'kredi.300');
  if (!product) return null;
  return (
    <main>
      <h1>{odeme.baslik}</h1>
      <CheckoutStep kind={product.kind} productLabel={product.code} priceLabel={tl(product.priceKurus)} />
    </main>
  );
}
