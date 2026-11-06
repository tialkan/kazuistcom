import { describe, expect, it } from 'vitest';
import {
  alintiVarMi,
  htmlMetne,
  karsilastirmaBicimi,
  kunyeCikar,
  maddeMetni,
  maddeOzeti,
  maddeleriBul,
  mevzuatMetinAdresi,
} from './dogrulama.ts';

// A made up law: nothing here quotes a real provision.
const SAHTE_KANUN = `SINAMA KANUNU Kanun Numarası : 9999 Kabul Tarihi : 22/11/2001 Yayımlandığı Resmî Gazete : Tarihi: 8/12/2001 Sayı: 24607
BİRİNCİ KISIM Madde 1 - Bu kanun yalnız sınama içindir. Kapsam Madde 2- (Değişik: 3/10/2001-4709/2 md.) Sınama maddesi ikincidir ve “tırnaklı” ifade taşır.
II. Başka başlık Madde 3 – Üçüncü madde 12 nci maddeye bakar. GEÇİCİ MADDE 1- Geçici hüküm. EK MADDE 1 - Ek hüküm. Madde 4/A - Dört A maddesi.`;

describe('page text', () => {
  it('drops scripts and styles, decodes entities and collapses spaces', () => {
    const html =
      '<html><script>var x = "Madde 9 - hayır";</script><style>p{}</style><p>Ama&ccedil;&nbsp;ve   kapsam &amp; &#252;&#x15F;</p></html>';
    expect(htmlMetne(html)).toBe('Amaç ve kapsam & üş');
  });
});

describe('comparison form', () => {
  it('unifies quotes, dashes and spaces but keeps diacritics', () => {
    expect(karsilastirmaBicimi('“Ek”  fıkra –  ibaresi')).toBe('"ek" fıkra - ibaresi');
    expect(karsilastirmaBicimi('MEDENÎ')).toBe('medenî');
    expect(karsilastirmaBicimi('Medeni')).not.toBe(karsilastirmaBicimi('Medenî'));
    expect(karsilastirmaBicimi('IŞIK')).toBe('ışık');
  });
});

describe('article lookup', () => {
  it('finds ordinary, lettered, ek and gecici articles with their own labels', () => {
    expect(maddeleriBul(SAHTE_KANUN).map((m) => m.no)).toEqual(['1', '2', '3', 'gecici-1', 'ek-1', '4/A']);
  });

  it('returns the text of one article up to the next heading', () => {
    expect(maddeMetni(SAHTE_KANUN, '1')).toContain('yalnız sınama içindir');
    expect(maddeMetni(SAHTE_KANUN, '1')).not.toContain('ikincidir');
    expect(maddeMetni(SAHTE_KANUN, '3')).toContain('12 nci maddeye bakar');
    expect(maddeMetni(SAHTE_KANUN, '12')).toBeNull();
    expect(maddeMetni(SAHTE_KANUN, '77')).toBeNull();
  });

  it('does not mistake a reference such as "12 nci maddeye" for a heading', () => {
    expect(maddeleriBul(SAHTE_KANUN).some((m) => m.no === '12')).toBe(false);
  });
});

describe('quotation check', () => {
  const madde2 = maddeMetni(SAHTE_KANUN, '2') as string;

  it('passes an exact quotation, also across typographic quote variants', () => {
    expect(alintiVarMi(madde2, 'Sınama maddesi ikincidir')).toBe(true);
    expect(alintiVarMi(madde2, 'ikincidir ve "tırnaklı" ifade taşır')).toBe(true);
  });

  it('fails a changed word, a missing word and a quotation from another article', () => {
    expect(alintiVarMi(madde2, 'Sınama maddesi üçüncüdür')).toBe(false);
    expect(alintiVarMi(madde2, 'Sınama maddesi ikincidir ve çok ifade taşır')).toBe(false);
    expect(alintiVarMi(madde2, 'Bu kanun yalnız sınama içindir')).toBe(false);
  });

  it('refuses a quotation that is too short to prove anything', () => {
    expect(alintiVarMi(madde2, 'Sınama')).toBe(false);
  });

  it('gives a fingerprint that changes when the article text changes', () => {
    const a = maddeOzeti(madde2);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(maddeOzeti(madde2)).toBe(a);
    expect(maddeOzeti(madde2.replace('ikincidir', 'ikincidir mi'))).not.toBe(a);
    expect(maddeOzeti(`${madde2}   `)).toBe(a);
  });
});

describe('header block', () => {
  it('reads the law number, the acceptance date and the Resmi Gazete data', () => {
    expect(kunyeCikar(SAHTE_KANUN)).toMatchObject({
      kanunNo: '9999',
      kabulTarihi: '2001-11-22',
      resmiGazeteTarihi: '2001-12-08',
      resmiGazeteSayisi: '24607',
      ad: 'SINAMA KANUNU',
    });
  });
  it('gives null for what the page does not state instead of guessing', () => {
    expect(kunyeCikar('Başka bir sayfa')).toEqual({
      kanunNo: null,
      kabulTarihi: null,
      resmiGazeteTarihi: null,
      resmiGazeteSayisi: null,
      ad: null,
    });
  });
  it('builds the address of the text frame from the type, the number and the tertip', () => {
    expect(mevzuatMetinAdresi(1, '4721', 5)).toBe(
      'https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=1&MevzuatNo=4721&MevzuatTertip=5',
    );
  });
});
