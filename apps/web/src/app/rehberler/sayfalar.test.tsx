import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ortak } from '@kazuist/i18n';
import tr from '@kazuist/i18n/tr/rehberler.json';
import { moduller } from '../(kabuk)/_kabuk/rotalar.ts';
import { adimGorunumu } from './_bilesen/metin.ts';
import { AdimListesi } from './_bilesen/AdimListesi.tsx';
import { makale } from './_veri/rehberler.ts';
import RehberlerSayfasi from './page.tsx';
import EtikSayfasi from './etik/page.tsx';
import KontrolSayfasi from './kontrol-listesi/page.tsx';
import MakaleSayfasi from './makale/page.tsx';
import TezSayfasi from './tez/page.tsx';
import ZoteroSayfasi from './zotero-endnote/page.tsx';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const sayfalar = {
  '/rehberler': RehberlerSayfasi,
  '/rehberler/makale': MakaleSayfasi,
  '/rehberler/tez': TezSayfasi,
  '/rehberler/zotero-endnote': ZoteroSayfasi,
  '/rehberler/kontrol-listesi': KontrolSayfasi,
  '/rehberler/etik': EtikSayfasi,
} as const;

describe('every guide page', () => {
  for (const [yol, Sayfa] of Object.entries(sayfalar)) {
    it(`${yol}: one h1, the academic integrity box with six violations, the fixed notices, a link to /tespit`, () => {
      const m = html(<Sayfa />);
      expect((m.match(/<h1/g) ?? []).length).toBe(1);
      expect(m).toContain(tr.etik.kutuBaslik);
      for (const ad of ['İntihal', 'Sahtecilik', 'Çarpıtma', 'Tekrar yayım', 'Dilimleme', 'Haksız yazarlık'])
        expect(m).toContain(ad);
      expect(m).toContain(ortak().uyari.intihal);
      expect(m).toContain(ortak().uyari.danismanlik);
      expect(m).toContain('href="/tespit"');
      expect(m).toContain(tr.gezinme.aria);
    });

    it(`${yol}: links only to open modules and no long dash`, () => {
      const m = html(<Sayfa />);
      for (const href of m.match(/href="\/(ara|yazma|pratik|atif-agi)"/g) ?? []) {
        expect(moduller.map((modul) => modul.href)).toContain(href.slice(6, -1));
      }
      expect(m).not.toContain(String.fromCharCode(0x2014));
    });
  }

  it('only the ethics page opens the details by default', () => {
    expect(html(<EtikSayfasi />)).toMatch(/<details open/);
    expect(html(<MakaleSayfasi />)).not.toMatch(/<details open/);
  });
});

describe('article guide', () => {
  it('lists 12 steps with a labelled done checkbox each and a progress bar', () => {
    const m = html(<MakaleSayfasi />);
    expect((m.match(/type="checkbox"/g) ?? []).length).toBe(12);
    expect((m.match(/aria-labelledby="makale-m\d\d-etiket makale-m\d\d-baslik"/g) ?? []).length).toBe(12);
    expect(m).toContain('<progress');
    expect(m).toContain('0 / 12 adım tamamlandı');
  });

  it('always shows the source search button, since /ara is a module of the shell', () => {
    const adim = makale.adimlar.find((a) => a.kaynakTuru);
    if (!adim) throw new Error('no search step');
    const g = adimGorunumu(adim, 1);
    expect(moduller.map((m) => m.href)).toContain('/ara');
    expect(g.araEtiket).toBe(tr.adim.ara[adim.kaynakTuru as keyof typeof tr.adim.ara]);
    const acik = html(<AdimListesi liste="makale" adimlar={[{ ...g, araEtiket: tr.adim.ara.mevzuat }]} />);
    expect(acik).toContain('href="/ara"');
  });
});

describe('thesis guide', () => {
  it('shows the monograph model, 12 steps each with a basis, and the source list with verification levels', () => {
    const m = html(<TezSayfasi />);
    expect(m).toContain(tr.tez.modelBaslik);
    expect((m.match(/type="checkbox"/g) ?? []).length).toBe(12);
    expect((m.match(new RegExp(`>${tr.adim.dayanak}<`, 'g')) ?? []).length).toBe(12);
    expect(m).toContain(tr.tez.rozet.birincil);
    expect(m).toContain(tr.tez.rozet.ikincil);
    expect(m).toContain('Dissertation and Project Planner');
  });
});

describe('Zotero and EndNote page', () => {
  it('has the comparison table with row headers, eight Zotero steps and six EndNote steps', () => {
    const m = html(<ZoteroSayfasi />);
    expect(m).toContain('<caption>');
    expect(m).toContain('scope="row"');
    expect((m.match(/id="z0\d"/g) ?? []).length).toBe(8);
    expect((m.match(/id="e0\d"/g) ?? []).length).toBe(6);
    expect(m).toContain('Add/Edit Citation');
    expect(m).toContain('Insert Citation');
  });
});

describe('checklist page', () => {
  it('has 14 tickable items, both labels, and rule links into /tespit', () => {
    const m = html(<KontrolSayfasi />);
    expect((m.match(/type="checkbox"/g) ?? []).length).toBe(14);
    expect(m).toContain(tr.kontrol.etiket['makale-ve-tez']);
    expect(m).toContain(tr.kontrol.etiket['yalniz-tez']);
    expect(m).toContain('href="/tespit#kural-8-12"');
    expect(m).toContain('0 / 14 madde işaretlendi');
  });
});
