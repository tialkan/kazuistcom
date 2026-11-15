import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FiyatlarSayfasi from './page.tsx';

/** /fiyatlar in payments-off launch mode (K-09) and with sales open; BYOK is offered either way (K-08). */
describe('/fiyatlar sales state', () => {
  afterEach(() => vi.unstubAllEnvs());

  const sales = (open: boolean) => {
    for (const k of ['IYZICO_API_KEY', 'IYZICO_SECRET_KEY', 'IYZICO_MERCHANT_ID'])
      vi.stubEnv(k, open ? 'yer-tutucu' : '');
  };

  it('without iyzico credentials says that credit sales are not open and points to BYOK', () => {
    sales(false);
    const html = renderToStaticMarkup(<FiyatlarSayfasi />);
    expect(html).toContain('data-testid="satis-kapali"');
    expect(html).toContain('Kredi satışı henüz açılmadı');
    expect(html).toContain('href="/hesap/yz-anahtari"');
    expect(html).not.toContain('href="/odeme');
  });

  it('with sales open drops the note but keeps the BYOK option', () => {
    sales(true);
    const html = renderToStaticMarkup(<FiyatlarSayfasi />);
    expect(html).not.toContain('satis-kapali');
    expect(html).toContain('href="/hesap/yz-anahtari"');
  });
});
