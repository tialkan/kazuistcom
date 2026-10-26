import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { CheckoutLegalPresentation } from '../legal-presentation.ts';
import { CheckoutStep } from '../checkout-step.tsx';

const props = {
  kind: 'abonelik' as const,
  code: 'ogrenci.yillik',
  productLabel: 'Öğrenci Plus, yıllık',
  priceLabel: '349,00 TL',
  versions: { preInfo: '2026-10-26.1', contract: '2026-10-26.2' },
  legal: {
    consentKey: 'published-fixture',
    versions: { preInfo: '2026-10-26.1', contract: '2026-10-26.2', annualCommitment: '2026-10-26.2' },
    documents: [
      {
        slug: 'on-bilgilendirme',
        title: 'Ön bilgilendirme formu',
        version: '2026-10-26.1',
        blocks: [
          { t: 'paragraf', c: [{ t: 'metin', v: 'Yayımlanmış kaynak: Çağrı Özgür, toplam 349,00 TL.' }] },
        ],
      },
      {
        slug: 'abonelik',
        title: 'Abonelik sözleşmesi',
        version: '2026-10-26.2',
        blocks: [{ t: 'paragraf', c: [{ t: 'metin', v: 'Yıllık ödeme dönemi ve fesih şartları.' }] }],
      },
    ],
  } satisfies CheckoutLegalPresentation,
};
it('shows the actual approved body and subscription heading instead of legal placeholders', () => {
  const html = renderToStaticMarkup(createElement(CheckoutStep, props));
  expect(html).toContain('Yayımlanmış kaynak: Çağrı Özgür, toplam 349,00 TL.');
  expect(html).toContain('Abonelik sözleşmesi');
  expect(html).not.toContain('[hukuk-uyum:');
  expect(html).not.toContain('Mesafeli satış sözleşmesi');
});

it('disables confirmation and payment when the published legal set is unavailable', () => {
  const html = renderToStaticMarkup(createElement(CheckoutStep, { ...props, legal: null }));
  expect(html).not.toContain('Yayımlanmış kaynak');
  expect(html.match(/disabled=""/g)).toHaveLength(3);
  expect(html).toContain('Ödeme şu anda kullanılamıyor.');
  expect(html).not.toContain('[hukuk-uyum:');
});
