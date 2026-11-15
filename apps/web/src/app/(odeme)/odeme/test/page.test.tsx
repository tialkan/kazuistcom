import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({ signedIn: true, name: 'Çağrı Özgür', published: true, payments: true }));
vi.mock('@/server/billing/acik.ts', () => ({ odemeAcik: () => state.payments }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/server/auth/context.ts', () => ({
  getAuthContext: async () => ({ config: { baseUrl: 'https://kazuist.com' } }),
}));
vi.mock('@/server/auth/guard.ts', () => ({
  resolvePrincipal: async () => (state.signedIn ? { userId: 'fixture-user' } : null),
}));
vi.mock('@/server/auth/account.ts', () => ({
  getMe: async () => ({ id: 'fixture-user', name: state.name, email: 'cagri@example.invalid' }),
}));
vi.mock('../../../(kabuk)/_hukuki/yukle.ts', () => ({
  hukukiMetin: (_lang: string, slug: string) => ({
    fm: {
      title: slug === 'abonelik' ? 'Abonelik sözleşmesi' : 'Ön bilgilendirme formu',
      slug,
      route: `/hukuki/${slug}`,
      lang: 'tr',
      binding: true,
      version: '2026-10-27.1',
      date: '2026-10-27',
      status: state.published ? 'yayinda' : 'taslak',
      pdf: true,
      pdf_fields: ['ALICI_AD', 'ALICI_EPOSTA', 'TUTAR_TL'],
    },
    ham: 'Alıcı: {{ALICI_AD}}, e-posta: {{ALICI_EPOSTA}}, toplam: {{TUTAR_TL}} TL.',
  }),
}));
import OdemePage from '../page.tsx';

beforeEach(() => {
  state.payments = true;
  state.signedIn = true;
  state.name = 'Çağrı Özgür';
  state.published = true;
});
const html = async () =>
  renderToStaticMarkup(await OdemePage({ searchParams: Promise.resolve({ urun: 'kredi.300' }) }));
it('wires the signed-in buyer and selected package into its published legal source', async () => {
  const body = await html();
  expect(body).toContain('Çağrı Özgür');
  expect(body).toContain('cagri@example.invalid');
  expect(body).toContain('mesafeli-satis');
  expect(body).toContain('2026-10-27.1');
  expect(body.match(/disabled=""/g)).toHaveLength(1);
});
it('does not display private buyer fields or open checkout for a guest', async () => {
  state.signedIn = false;
  const body = await html();
  expect(body).not.toContain('cagri@example.invalid');
  expect(body).toContain('Ödeme için giriş yapmanız gerekiyor.');
  expect(body.match(/disabled=""/g)).toHaveLength(3);
});
it('does not invent a buyer surname from an incomplete profile', async () => {
  state.name = 'Çağrı';
  const body = await html();
  expect(body).toContain('profilinizde adınızı ve soyadınızı tamamlayın');
  expect(body).not.toContain('Çağrı Kazuist');
  expect(body.match(/disabled=""/g)).toHaveLength(3);
});
it('keeps the actual page closed on draft sources even for a signed-in buyer', async () => {
  state.published = false;
  const body = await html();
  expect(body).not.toContain('cagri@example.invalid');
  expect(body).toContain('Ödeme şu anda kullanılamıyor.');
  expect(body.match(/disabled=""/g)).toHaveLength(3);
});

it('closes legacy subscription links without showing consent or buyer fields', async () => {
  const body = renderToStaticMarkup(
    await OdemePage({ searchParams: Promise.resolve({ urun: 'ogrenci.yillik' }) }),
  );
  expect(body).toContain('Yeni abonelik satışı kapalıdır');
  expect(body).not.toContain('cagri@example.invalid');
  expect(body).not.toContain('type="checkbox"');
});

it('payments-off launch mode: no checkout, free and BYOK are offered instead (K-09)', async () => {
  state.payments = false;
  const body = await html();
  expect(body).toContain('Kredi satışı henüz açılmadı');
  expect(body).toContain('href="/hesap/yz-anahtari"');
  expect(body).toContain('href="/fiyatlar"');
  expect(body).not.toContain('type="checkbox"');
  expect(body).not.toContain('cagri@example.invalid');
});
