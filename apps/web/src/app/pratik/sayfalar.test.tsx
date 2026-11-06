import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import tr from '@kazuist/i18n/tr/pratik.json';
import { gorunenKartlar, tumDesteler } from './_veri/desteler.ts';
import { oyunlar, type Oyun } from './_alan/kart.ts';
import { Geribildirim } from './_bilesen/Geribildirim.tsx';
import { KartSorusu } from './_bilesen/KartSorusu.tsx';
import EditorSayfasi from './editor/page.tsx';
import HmgsSayfasi from './hmgs/page.tsx';
import DenemeSayfasi from './hmgs/deneme/page.tsx';
import PratikSayfasi from './page.tsx';
import DesteSayfasi from './deste/[slug]/page.tsx';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next/headers', () => ({
  headers: async () => {
    throw new Error('outside a request');
  },
}));

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const kartlar = tumDesteler.flatMap((d) => gorunenKartlar(d, true));
const kartOyunu = (oyun: Oyun) => {
  const k = kartlar.find((x) => x.oyun === oyun);
  if (!k) throw new Error(`no ${oyun} card`);
  return k;
};

describe('the four games render their own layout with keyboard operable choices', () => {
  for (const oyun of oyunlar) {
    it(`${oyun}: a labelled group of native buttons, numbered, with a hint for the keys`, () => {
      const k = kartOyunu(oyun);
      const m = html(
        <KartSorusu kart={k} secili={null} goster={false} kilitli={false} onSec={() => {}} kimlik="t" />,
      );
      expect(m).toContain(`data-oyun="${oyun}"`);
      expect(m).toContain('role="group"');
      expect((m.match(/<button/g) ?? []).length).toBe(k.secenekler.length);
      expect(m).toContain('type="button"');
      expect(m).toContain('aria-pressed="false"');
      expect(m).toContain('1 ile');
      expect(m).not.toContain(tr.secenek.dogruIsareti);
    });
  }

  it('marks the right option and the wrong choice with a shape and a text, not by color alone', () => {
    const k = kartOyunu('dogru_yanlis');
    const yanlis = (k.dogruIndex + 1) % 2;
    const m = html(<KartSorusu kart={k} secili={yanlis} goster kilitli onSec={() => {}} kimlik="t" />);
    expect(m).toContain(tr.secenek.dogruIsareti);
    expect(m).toContain(tr.secenek.yanlisIsareti);
    expect(m).toContain('<svg');
    expect(m).toContain('data-durum="dogru"');
    expect(m).toContain('data-durum="yanlis"');
    expect(m).toContain('aria-disabled="true"');
  });

  it('shows the selected option with a text in the exam (no result revealed)', () => {
    const k = kartOyunu('olay_karti');
    const m = html(
      <KartSorusu kart={k} secili={2} goster={false} kilitli={false} onSec={() => {}} kimlik="t" />,
    );
    expect(m).toContain(tr.secenek.secili);
    expect(m).not.toContain(tr.secenek.dogruIsareti);
  });
});

describe('feedback after an answer (FR-58)', () => {
  const k = kartOyunu('hala_gecerli_mi');
  it('says right or wrong in words with a mark, then gives the explanation, the source and the quotation', () => {
    const dogru = html(<Geribildirim kart={k} secim={k.dogruIndex} kimlik="t" />);
    expect(dogru).toContain(tr.geri.dogru);
    expect(dogru).not.toContain(tr.geri.yanlis);
    const yanlis = html(<Geribildirim kart={k} secim={(k.dogruIndex + 1) % 3} kimlik="t" />);
    expect(yanlis).toContain(tr.geri.yanlis);
    expect(yanlis).toContain(tr.geri.dogruSecenek);
    for (const m of [dogru, yanlis]) {
      expect(m).toContain('<svg');
      expect(m).toContain(k.aciklama.replaceAll('"', '&quot;'));
      expect(m).toContain(k.kanun[0]?.ref as string);
      expect(m).toContain('<blockquote');
      expect(m).toContain(tr.geri.ac);
      expect(m).toContain('rel="noopener noreferrer"');
      expect(m).toContain('target="_blank"');
      expect(m).toContain(tr.geri.yeniSekme);
    }
  });
});

describe('pages', () => {
  it('shows the module hub with the honest empty state while no card is published', async () => {
    const m = html(<PratikSayfasi />);
    expect(m).toContain(tr.baslik);
    expect(m).toContain(tr.bos.baslik);
    expect(m).toContain(tr.oyunlar.olayKarti.ad);
    expect(m).toContain(tr.oyunlar.halaGecerliMi.ad);
    expect(m).toContain(tr.oyunlar.dogruYanlis.ad);
    expect(m).toContain(tr.oyunlar.hangisiOnce.ad);
    expect(m).toContain(tr.cihazNotu);
  });

  it('shows all 20 HMGS areas with the exam format and no exam while no question is published', async () => {
    const m = html(<HmgsSayfasi />);
    expect(m.match(/<tr>/g)?.length).toBeGreaterThanOrEqual(22);
    expect(m).toContain('Medeni Hukuk');
    expect(m).toContain('Türk Hukuk Tarihi');
    expect(m).toContain(tr.hmgs.sinav.madde1);
    expect(m).toContain(tr.hmgs.sinav.madde3);
    expect(m).toContain(tr.hmgs.denemeKapali);
    expect(m).not.toContain('href="/pratik/hmgs/deneme"');
  });

  it('opens a deck page for a deck that exists and a not found for the others', async () => {
    const m = html(await DesteSayfasi({ params: Promise.resolve({ slug: 'medeni-hukuk' }) }));
    expect(m).toContain('Medeni Hukuk');
    expect(m).toContain('Türk Medeni Kanunu');
    await expect(DesteSayfasi({ params: Promise.resolve({ slug: 'borclar-hukuku' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('renders the exam page and keeps the editor queue closed without a session', async () => {
    expect(html(<DenemeSayfasi />)).toContain(tr.meta.denemeBaslik);
    const m = html(await EditorSayfasi());
    expect(m).toContain(tr.editor.yetkiYok);
    expect(m).not.toContain('anayasa-hukuku.001');
  });
});
