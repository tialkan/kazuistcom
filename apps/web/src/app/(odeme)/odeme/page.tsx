import odeme from '@kazuist/i18n/tr/odeme.json';
import { PRICE_TABLE_V1, findProduct } from '@kazuist/ledger';
import type { Metadata } from 'next';
import { hukukiMetinSurumu } from '../../(kabuk)/_hukuki/yukle.ts';
import { CheckoutStep } from './checkout-step.tsx';

export const metadata: Metadata = { title: odeme.baslik, robots: { index: false, follow: false } };

const tl = (kurus: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);

export default async function OdemePage(props: { searchParams: Promise<{ urun?: string }> }) {
  const { urun } = await props.searchParams;
  const product =
    findProduct(PRICE_TABLE_V1, urun ?? 'kredi.300') ?? findProduct(PRICE_TABLE_V1, 'kredi.300');
  if (!product) return null;
  // The versions the user accepts are the published ones; the API refuses any other (audit O5).
  const preInfo = hukukiMetinSurumu('on-bilgilendirme');
  const contract = hukukiMetinSurumu(product.kind === 'paket' ? 'mesafeli-satis' : 'abonelik');
  return (
    <div className="sayfa">
      <h1>{odeme.baslik}</h1>
      <CheckoutStep
        kind={product.kind}
        code={product.code}
        productLabel={product.code}
        priceLabel={tl(product.priceKurus)}
        versions={preInfo && contract ? { preInfo, contract } : null}
      />
    </div>
  );
}
