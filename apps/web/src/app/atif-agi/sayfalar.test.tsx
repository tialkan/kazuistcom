import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tr from '@kazuist/i18n/tr/atif-agi.json';
import { sentetikAg } from './_alan/test-verisi.ts';
import { sayfaParametreleri } from './_alan/sayfa.ts';
import { AgGorunumu } from './_bilesen/AgGorunumu.tsx';
import { DetayPaneli } from './_bilesen/DetayPaneli.tsx';
import { OzetKartlari } from './_bilesen/OzetKartlari.tsx';
import { Tablolar } from './_bilesen/Tablolar.tsx';
import { kaynagiDegistir } from './_sunucu/kaynak.ts';
import AtifAgiSayfasi from './page.tsx';

vi.mock('@/server/auth/context', () => ({ getAuthContext: async () => ({}) }));

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
afterEach(() => kaynagiDegistir(undefined));

describe('two column view markup', () => {
  const ag = sentetikAg();
  const m = html(<AgGorunumu ag={ag} />);

  it('has two labelled lists of native buttons, one per node, and a polite detail region', () => {
    expect(m).toContain(`aria-label="${tr.ag.baslik}"`);
    expect((m.match(/<ul/g) ?? []).length).toBe(2);
    expect((m.match(/<button/g) ?? []).length).toBe(ag.nodes.length + ag.works.length);
    expect(m).toContain('aria-pressed="false"');
    expect(m).toContain('aria-live="polite"');
    expect(m).toContain(tr.detay.bos);
  });
  it('draws the lines in an aria-hidden layer, not in the accessibility tree', () => {
    expect(m).toMatch(/aria-hidden="true"[^>]*><svg/);
  });
  it('marks the most cited work with a text, not by colour alone, and gives every node its counts as text', () => {
    expect(m).toContain(tr.ag.cokAtif);
    expect(m).toContain('6 kararda atıf');
    expect(m).toContain('yıl 1990');
  });
  it('explains the keys', () => {
    expect(m).toContain(tr.ag.ipucu);
  });
});

describe('detail panel (FR-29, FR-30)', () => {
  const ag = sentetikAg();
  it('a decision lists its works with pages, the decisions it cites, and the ones citing it, with "Metni aç"', () => {
    const m = html(<DetayPaneli ag={ag} secim={{ tur: 'karar', id: 'k1' }} onSec={() => {}} />);
    expect(m).toContain(tr.detay.metniAc);
    expect(m).toContain('/ara?q=E.%202014%2F1-10%20K.%202015%2F100');
    expect(m).toContain('rel="noopener noreferrer"');
    expect(m).toContain('Yazar1, A.: Sentetik eser 1');
    expect(m).toContain('s. 5, s. 6');
    expect(m).toContain(tr.detay.corpustaYok); // an external decision has no link
    expect(m).toContain('Hukuk Genel Kurulu E. 2014/2-11 K. 2015/101'); // k2 cites k1
  });
  it('a work lists its citing decisions and editions', () => {
    const m = html(<DetayPaneli ag={ag} secim={{ tur: 'eser', id: 'e2' }} onSec={() => {}} />);
    expect(m).toContain('2 kararda atıf');
    expect(m).toContain('İstanbul 1991 2. baskı');
    expect(m).toContain('Sentetik eser 2');
  });
});

describe('table view is equivalent to the network', () => {
  const ag = sentetikAg();
  const m = html(<Tablolar ag={ag} />);
  it('has captions, column headers and row headers and no cap', () => {
    expect((m.match(/<caption>/g) ?? []).length).toBe(2);
    expect(m).toContain('scope="col"');
    expect(m).toContain('scope="row"');
    for (const k of ag.nodes) expect(m).toContain(`E. ${k.esasNo} K. ${k.kararNo}`);
    for (const w of ag.works) expect(m).toContain(w.baslik);
    expect(m).toContain('s. 5, s. 6');
  });
});

describe('summary cards (FR-27)', () => {
  it('shows the four counts and the most cited work', () => {
    const m = html(<OzetKartlari ozet={sentetikAg().summary} />);
    for (const k of [tr.ozet.kararSayisi, tr.ozet.eserSayisi, tr.ozet.doktrinAtfiSayisi, tr.ozet.enCok])
      expect(m).toContain(k);
    expect(m).toContain('Sentetik eser 1');
  });
  it('says honestly when no work has more than one citing decision', () => {
    expect(html(<OzetKartlari ozet={sentetikAg(1, 1).summary} />)).toContain(tr.ozet.enCokYok);
  });
});

describe('page', () => {
  it('splits the view parameter from the filters', () => {
    const p = sayfaParametreleri({ gorunum: 'tablo', court: 'Yargıtay', from: ['2013'] });
    expect(p.gorunum).toBe('tablo');
    expect(p.sorgu.toString()).toBe('court=Yarg%C4%B1tay&from=2013');
    expect(sayfaParametreleri({ gorunum: 'x' }).gorunum).toBe('ag');
  });
  it('renders the example source with the notice, filters, switch and the network', async () => {
    const m = html(await AtifAgiSayfasi({ searchParams: Promise.resolve({}) }));
    expect(m).toContain('<h1>Atıf ağı</h1>');
    expect(m).toContain(tr.durum.ornek);
    expect(m).toContain('method="get"');
    expect(m).toContain('aria-current="page"');
    expect(m).toContain(tr.gorunum.tablo);
    expect(m).toContain('Türk Medeni Hukuku');
  });
  it('renders the table view and says so when a filter matches nothing', async () => {
    expect(html(await AtifAgiSayfasi({ searchParams: Promise.resolve({ gorunum: 'tablo' }) }))).toContain(
      '<caption>',
    );
    expect(
      html(await AtifAgiSayfasi({ searchParams: Promise.resolve({ court: 'Anayasa Mahkemesi' }) })),
    ).toContain(tr.durum.bos);
  });
  it('an invalid filter is announced and ignored', async () => {
    const m = html(await AtifAgiSayfasi({ searchParams: Promise.resolve({ from: 'abc' }) }));
    expect(m).toContain(tr.filtre.gecersiz);
    expect(m).toContain('role="alert"');
  });
  it('a failing source shows an error, not a crash', async () => {
    kaynagiDegistir({ ag: async () => Promise.reject(new Error('x')), kayitAgi: async () => null });
    expect(html(await AtifAgiSayfasi({ searchParams: Promise.resolve({}) }))).toContain(tr.durum.hata);
  });
});
