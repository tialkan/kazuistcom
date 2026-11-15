import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ortak } from '@kazuist/i18n';
import byok from '@kazuist/i18n/tr/byok.json' with { type: 'json' };
import { gorunenPlanlar, planlar } from './fiyatlar.ts';
import FiyatlarSayfasi from './page.tsx';

const GUNLUK = 'Günlük hak: 2 kaynaklı özet';
const PROMO = '50 promosyon kredisi';
const PROMO_KURALI = ortak().fiyatlar.kural['2'];
const html = () => renderToStaticMarkup(<FiyatlarSayfasi />);

const sales = (open: boolean) => {
  for (const k of ['IYZICO_API_KEY', 'IYZICO_SECRET_KEY', 'IYZICO_MERCHANT_ID'])
    vi.stubEnv(k, open ? 'yer-tutucu' : '');
};
const platformAi = (on: boolean) => {
  vi.stubEnv('OPENROUTER_API_KEY', on ? 'yer-tutucu' : '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('AI_DAILY_BUDGET_TRY', on ? '500' : '');
};

afterEach(() => vi.unstubAllEnvs());

/** /fiyatlar in payments-off launch mode (K-09) and with sales open; BYOK is offered either way (K-08). */
describe('/fiyatlar sales state', () => {
  it('without iyzico credentials says that credit sales are not open and points to BYOK', () => {
    sales(false);
    platformAi(true);
    const h = html();
    expect(h).toContain('data-testid="satis-kapali"');
    expect(h).toContain('Kredi satışı henüz açılmadı');
    expect(h).toContain('href="/hesap/yz-anahtari"');
    expect(h).not.toContain('href="/odeme');
  });

  it('with sales open drops the note but keeps the BYOK option', () => {
    sales(true);
    platformAi(true);
    const h = html();
    expect(h).not.toContain('satis-kapali');
    expect(h).toContain('href="/hesap/yz-anahtari"');
  });
});

/** The offer follows the server configuration: no daily allowance without platform AI, no promo without sales. */
describe('/fiyatlar platform AI state', () => {
  it('platform AI on and sales open: plan 4.2 verbatim, promo credits and their rule included', () => {
    sales(true);
    platformAi(true);
    const h = html();
    expect(h).toContain(GUNLUK);
    expect(h).toContain(PROMO);
    expect(h).toContain(PROMO_KURALI);
    expect(h).toContain(ortak().fiyatlar.giris);
  });

  it('platform AI on, sales off: daily allowance stays, every promo credit mention goes', () => {
    sales(false);
    platformAi(true);
    const h = html();
    expect(h).toContain(GUNLUK);
    expect(h).not.toContain(PROMO);
    expect(h).not.toContain(PROMO_KURALI);
    expect(h).toContain(byok.teklif.giris);
    expect(h).toContain(byok.satisKapali.metin);
  });

  it('platform AI off (BYOK-only launch): no daily allowance or promo, BYOK is the way to a summary', () => {
    sales(false);
    platformAi(false);
    const h = html();
    expect(h).not.toContain(GUNLUK);
    expect(h).not.toContain('günlük ücretsiz hakla');
    expect(h).not.toContain(PROMO);
    expect(h).not.toContain(PROMO_KURALI);
    expect(h).toContain(byok.teklif.girisByok);
    expect(h).toContain(byok.teklif.ucretsizKrediByok);
    expect(h).toContain(byok.satisKapali.metinByok);
    expect(h).not.toContain(byok.satisKapali.metin);
    expect(h).toContain('href="/hesap/yz-anahtari"');
  });

  it('a platform key without AI_DAILY_BUDGET_TRY counts as platform AI off', () => {
    sales(false);
    platformAi(false);
    vi.stubEnv('OPENROUTER_API_KEY', 'yer-tutucu');
    expect(html()).toContain(byok.teklif.girisByok);
  });

  it('only the free plan row changes; BYOK and credit rows stay as in plan 4.2', () => {
    for (const platformYz of [true, false])
      for (const satisAcik of [true, false]) {
        const rows = gorunenPlanlar({ platformYz, satisAcik });
        expect(rows.slice(1)).toEqual(planlar.slice(1));
      }
    expect(gorunenPlanlar({ platformYz: true, satisAcik: true })).toEqual(planlar);
  });
});
