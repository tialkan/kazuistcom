/* eslint-disable @typescript-eslint/no-non-null-assertion -- test lookups fail loudly anyway */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  BosDurum,
  Dugme,
  Etiket,
  etiketSekli,
  FormAlani,
  HalkaGrafik,
  HataDurumu,
  IletisimKutusu,
  KaynakCipi,
  Sekmeler,
  SerhliMetin,
  SerhSatiri,
  Tablo,
  Yukleniyor,
} from '../src/index.ts';

afterEach(cleanup);

beforeAll(() => {
  // jsdom has <dialog> but not the modal methods.
  const proto = HTMLDialogElement.prototype;
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

async function axeViolations(container: Element) {
  const r = await axe.run(container, {
    rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
  });
  return r.violations.map((v) => `${v.impact}: ${v.id}`);
}

describe('Dugme', () => {
  it('renders a native button with type=button by default', () => {
    render(<Dugme>Kaydet</Dugme>);
    const b = screen.getByRole('button', { name: 'Kaydet' });
    expect(b.getAttribute('type')).toBe('button');
    expect(b.className).toContain('kz-dugme--birincil');
  });
  it('renders a link when href is given', () => {
    render(
      <Dugme href="/fiyatlar" tur="ikincil">
        Fiyatlar
      </Dugme>,
    );
    expect(screen.getByRole('link', { name: 'Fiyatlar' }).getAttribute('href')).toBe('/fiyatlar');
  });
});

describe('FormAlani', () => {
  it('keeps the label visible and the live region present before any error', async () => {
    const { container } = render(<FormAlani id="eposta" etiket="E-posta" ipucu="Okul adresiniz olabilir." />);
    const input = screen.getByLabelText('E-posta');
    expect(input.getAttribute('aria-describedby')).toBe('eposta-ipucu');
    expect(container.querySelector('#eposta-hata')?.getAttribute('aria-live')).toBe('polite');
    expect(await axeViolations(container)).toEqual([]);
  });
  it('links the error and marks the field invalid', async () => {
    const { container } = render(<FormAlani id="ad" etiket="Ad" hata="Adınızı yazın." />);
    const input = screen.getByLabelText('Ad');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('ad-hata');
    expect(screen.getByText('Adınızı yazın.')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
  it('renders a textarea', () => {
    render(<FormAlani id="not" etiket="Not" cokSatir />);
    expect(screen.getByLabelText('Not').tagName).toBe('TEXTAREA');
  });
});

describe('Sekmeler', () => {
  const sekmeler = [
    { id: 'a', baslik: 'Mevzuat', icerik: <p>Mevzuat paneli</p> },
    { id: 'b', baslik: 'Kararlar', icerik: <p>Kararlar paneli</p> },
    { id: 'c', baslik: 'Makaleler', icerik: <p>Makaleler paneli</p> },
  ];
  it('moves selection with arrow keys, Home and End (roving tabindex)', async () => {
    const { container } = render(<Sekmeler sekmeler={sekmeler} etiket="Kaynak türü" />);
    const [a, b, c] = screen.getAllByRole('tab');
    expect(a?.getAttribute('aria-selected')).toBe('true');
    expect(b?.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(a!, { key: 'ArrowRight' });
    expect(b?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(b);
    expect(screen.getByRole('tabpanel').textContent).toBe('Kararlar paneli');
    fireEvent.keyDown(b!, { key: 'End' });
    expect(c?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(c!, { key: 'ArrowRight' });
    expect(a?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(a!, { key: 'ArrowLeft' });
    expect(c?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(c!, { key: 'Home' });
    expect(a?.getAttribute('aria-selected')).toBe('true');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('IletisimKutusu', () => {
  function Ornek() {
    const [acik, setAcik] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setAcik(true)}>
          Aç
        </button>
        <IletisimKutusu acik={acik} kapat={() => setAcik(false)} baslik="Kredi onayı" kapatEtiketi="Kapat">
          <p>Bu işlem 30 kredi kullanır.</p>
        </IletisimKutusu>
      </>
    );
  }
  it('opens on demand, is named by its title and returns focus on close', async () => {
    const { container } = render(<Ornek />);
    const ac = screen.getByRole('button', { name: 'Aç' });
    ac.focus();
    await act(async () => fireEvent.click(ac));
    const dialog = container.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe(container.querySelector('h2')?.id);
    expect(await axeViolations(container)).toEqual([]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Kapat' })));
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(ac);
  });
});

describe('Etiket and KaynakCipi', () => {
  it('gives every label kind a distinct shape so colour is never the only signal', () => {
    const kayit = [
      'yeni',
      'yerlesik',
      'eski',
      'oncu',
      'anonim',
      'ilgililik',
      'guncellik',
      'canli',
      'veri-gunu',
    ] as const;
    expect(new Set(kayit.map((k) => etiketSekli[k])).size).toBe(kayit.length);
    const otorite = ['baglayici', 'yuksek-emsal', 'emsal', 'diger-otorite'] as const;
    expect(new Set(otorite.map((k) => etiketSekli[k])).size).toBe(otorite.length);
  });
  it('renders shape (hidden) plus visible text', async () => {
    const { container } = render(<Etiket tur="yeni">Yeni</Etiket>);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe('Yeni');
    expect(await axeViolations(container)).toEqual([]);
  });
  it('source chip shows number, citation and authority text', async () => {
    const { container } = render(
      <KaynakCipi
        no={1}
        kunye="Yargıtay HGK E.2013/19-199 K.2013/1418"
        otorite="yuksek-emsal"
        otoriteMetni="Yüksek emsal"
        href="/karar/x"
      />,
    );
    const link = screen.getByRole('link');
    expect(link.textContent).toContain('Yargıtay HGK E.2013/19-199 K.2013/1418');
    expect(link.textContent).toContain('Yüksek emsal');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Kenar serhi', () => {
  it('keeps the sentence before its margin in reading order and names the margin', async () => {
    const { container } = render(
      <SerhliMetin etiket="Kaynaklı özet">
        <SerhSatiri
          serhEtiketi="Bu cümlenin kaynakları"
          serh={<KaynakCipi no={1} kunye="TBK m.49" otorite="baglayici" otoriteMetni="Bağlayıcı" />}
        >
          <p>Haksız fiil sorumluluğu kusur şartına bağlıdır.</p>
        </SerhSatiri>
      </SerhliMetin>,
    );
    const satir = container.querySelector('.kz-serh-satiri')!;
    expect(satir.firstElementChild?.className).toBe('kz-serh-satiri__metin');
    expect(screen.getByRole('complementary', { name: 'Bu cümlenin kaynakları' })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('HalkaGrafik', () => {
  it('states the value as text and clamps the ring', async () => {
    const { container } = render(
      <HalkaGrafik deger={2500} azami={2000} etiket="Haftalık hedef" degerMetni="2.500 / 2.000 kelime" />,
    );
    expect(screen.getByRole('img', { name: 'Haftalık hedef: 2.500 / 2.000 kelime' })).toBeTruthy();
    expect(container.textContent).toContain('%100');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Tablo', () => {
  it('has caption, column and row headers and a focusable scroll region', async () => {
    const { container } = render(
      <Tablo
        baslik="Kredi paketleri"
        satirAnahtari={(r: { ad: string; fiyat: string }) => r.ad}
        sutunlar={[
          { anahtar: 'ad', baslik: 'Paket', hucre: (r) => r.ad },
          { anahtar: 'fiyat', baslik: 'Fiyat', hucre: (r) => r.fiyat, sayisal: true },
        ]}
        satirlar={[{ ad: 'Başlangıç', fiyat: '39 TL' }]}
      />,
    );
    expect(screen.getByRole('table', { name: 'Kredi paketleri' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Başlangıç' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Kredi paketleri' }).getAttribute('tabindex')).toBe('0');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('states', () => {
  it('error is an alert, loading is a status, empty has a heading', async () => {
    const { container } = render(
      <main>
        <BosDurum baslik="Henüz kayıt yok" aciklama="Arama sonuçlarından kaydedin." />
        <HataDurumu baslik="Sonuçlar yüklenemedi" />
        <Yukleniyor metin="Kaynaklar getiriliyor" />
      </main>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Sonuçlar yüklenemedi');
    expect(screen.getByRole('status').textContent).toContain('Kaynaklar getiriliyor');
    expect(screen.getByRole('heading', { name: 'Henüz kayıt yok' })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
});
