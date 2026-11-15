import { platformAiAvailable } from '@kazuist/ai-gateway/config';
import byok from '@kazuist/i18n/tr/byok.json' with { type: 'json' };
import odeme from '@kazuist/i18n/tr/odeme.json';
import { Dugme } from '@kazuist/ui';
import { PRICE_TABLE_V1, addMonths, findProduct } from '@kazuist/ledger';
import { orderFields, type Order } from '@kazuist/ledger/billing';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getMe } from '@/server/auth/account.ts';
import { odemeAcik } from '@/server/billing/acik.ts';
import { getAuthContext } from '@/server/auth/context.ts';
import { resolvePrincipal } from '@/server/auth/guard.ts';
import { hukukiMetin } from '../../(kabuk)/_hukuki/yukle.ts';
import { CheckoutStep } from './checkout-step.tsx';
import { buildCheckoutLegalPresentation, type CheckoutLegalPresentation } from './legal-presentation.ts';

export const metadata: Metadata = { title: odeme.baslik, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const tl = (kurus: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);

export default async function OdemePage(props: { searchParams: Promise<{ urun?: string }> }) {
  const { urun } = await props.searchParams;
  const product =
    findProduct(PRICE_TABLE_V1, urun ?? 'kredi.300') ?? findProduct(PRICE_TABLE_V1, 'kredi.300');
  if (!product) return null;
  if (product.kind !== 'paket')
    return (
      <div className="sayfa" style={{ maxWidth: '54rem', margin: '0 auto', padding: '2rem 1.25rem' }}>
        <h1>{odeme.baslik}</h1>
        <p role="status">{odeme.abonelikSatisiKapali}</p>
      </div>
    );
  // Payments-off launch mode (K-09): no buy flow that can only end in 503; free and BYOK are offered instead.
  if (!odemeAcik())
    return (
      <div className="sayfa" style={{ maxWidth: '54rem', margin: '0 auto', padding: '2rem 1.25rem' }}>
        <h1>{odeme.baslik}</h1>
        <section aria-labelledby="satis-kapali" data-testid="satis-kapali">
          <h2 id="satis-kapali">{byok.satisKapali.baslik}</h2>
          {/* No daily allowance is promised when the platform AI is off (BYOK-only launch). */}
          <p role="status">
            {platformAiAvailable() ? byok.satisKapali.odemeMetin : byok.satisKapali.odemeMetinByok}
          </p>
          <p style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Dugme href="/hesap/yz-anahtari">{byok.satisKapali.byok}</Dugme>
            <Dugme href="/fiyatlar" tur="ikincil">
              {byok.satisKapali.fiyatlar}
            </Dugme>
          </p>
        </section>
      </div>
    );
  let legal: CheckoutLegalPresentation | null = null;
  let blockedMessage = odeme.hata.girisGerekli;
  try {
    const ctx = await getAuthContext();
    const principal = await resolvePrincipal(
      new Request(`${ctx.config.baseUrl}/odeme`, { headers: await headers() }),
      ctx,
    );
    const me = principal ? await getMe(ctx, principal.userId) : null;

    if (me) {
      blockedMessage = odeme.hukukiMetinKapali;
      const nameParts = (me.name ?? '').trim().split(/\s+/).filter(Boolean);
      if (nameParts.length < 2) {
        blockedMessage = odeme.hata.adSoyadGerekli;
      } else {
        const preInfo = hukukiMetin('tr', 'on-bilgilendirme');
        const contract = hukukiMetin('tr', product.kind === 'paket' ? 'mesafeli-satis' : 'abonelik');
        const surname = nameParts.pop() as string;
        const now = new Date();
        // This is an unpersisted current checkout view, never a reconstruction of a past order/PDF.
        const previewOrder: Order = {
          id: 'checkout-preview',
          userId: me.id,
          productCode: product.code,
          amountKurus: product.priceKurus,
          couponCode: null,
          status: 'bekliyor',
          idempotencyKey: '',
          consentVersions: {},
          checkoutToken: null,
          paymentId: null,
          createdAt: now,
          paidAt: null,
        };
        if (preInfo && contract)
          legal = buildCheckoutLegalPresentation({
            kind: product.kind,
            annual: product.interval === 'yillik',
            preInfo,
            contract,
            acceptedVersions: {
              preInfo: preInfo.fm.version,
              contract: contract.fm.version,
              ...(product.interval === 'yillik' ? { annualCommitment: contract.fm.version } : {}),
            },
            fields: orderFields({
              order: previewOrder,
              buyer: { name: nameParts.join(' '), surname, email: me.email },
              tables: [PRICE_TABLE_V1],
              periodStart: now,
              periodEnd: addMonths(now, product.interval === 'yillik' ? 12 : 1),
            }),
          });
      }
    }
  } catch {
    // No fallback legal body or guessed version on missing authentication/configuration/publication.
  }
  return (
    <div className="sayfa" style={{ maxWidth: '54rem', margin: '0 auto', padding: '2rem 1.25rem' }}>
      <h1>{odeme.baslik}</h1>
      <CheckoutStep
        key={`${product.code}:${legal?.consentKey}`}
        kind={product.kind}
        code={product.code}
        productLabel={odeme.urunAdlari[product.code as keyof typeof odeme.urunAdlari] ?? product.code}
        priceLabel={tl(product.priceKurus)}
        legal={legal}
        blockedMessage={blockedMessage}
      />
    </div>
  );
}
