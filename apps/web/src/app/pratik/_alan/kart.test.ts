import { describe, expect, it } from 'vitest';
import {
  desteSchema,
  gerekenOnay,
  kartDurumu,
  kartGorunumu,
  kartSchema,
  kartUuid,
  kaynakKaydi,
} from './kart.ts';
import { ilkKaynak, kartYap } from './test-verisi.ts';

const hata = (v: unknown) => {
  const s = kartSchema.safeParse(v);
  return s.success ? [] : s.error.issues.map((i) => i.message);
};

describe('card schema', () => {
  it('accepts a valid card and rejects extra keys', () => {
    expect(kartYap().id).toBe('deneme-deste.001');
    expect(kartSchema.safeParse({ ...kartYap(), gizli: 1 }).success).toBe(false);
  });

  it('fixes the choices of the true or false and the still valid games', () => {
    const dy = { ...kartYap(), oyun: 'dogru_yanlis', secenekler: ['Doğru', 'Yanlış'], dogruIndex: 0 };
    expect(hata(dy)).toEqual([]);
    expect(hata({ ...dy, secenekler: ['Evet', 'Hayır'] }).join()).toContain('Doğru and Yanlış');
    const hg = {
      ...kartYap(),
      oyun: 'hala_gecerli_mi',
      secenekler: ['Hâlâ geçerli', 'Değişti', 'Geçersiz (yürürlükten kalktı)'],
      dogruIndex: 2,
    };
    expect(hata(hg)).toEqual([]);
    expect(hata({ ...hg, secenekler: ['Hâlâ geçerli', 'Değişti'] }).join()).toContain('three fixed choices');
  });

  it('wants two choices and a quotation for each in the which-came-first game', () => {
    const base = {
      ...kartYap(),
      oyun: 'hangisi_once',
      secenekler: ['Önceki düzenleme', 'Sonraki düzenleme'],
      dogruIndex: 0,
    };
    expect(hata(base).join()).toContain('one quotation per choice');
    const iki = kartYap().kaynaklar[0];
    expect(
      hata({
        ...base,
        kaynaklar: [
          { ...iki, alintilar: ['Birinci sınama alıntısı geçer.', 'İkinci sınama alıntısı geçer.'] },
        ],
      }),
    ).toEqual([]);
  });

  it('keeps the answer inside the choices and the choices different', () => {
    expect(
      hata({ ...kartYap(), dogruIndex: 4, secenekler: ['A birinci', 'B ikinci', 'C üçüncü'] }).join(),
    ).toContain('outside');
    expect(hata({ ...kartYap(), secenekler: ['Aynı', 'Aynı', 'Başka'] }).join()).toContain('different');
  });

  it('requires the corpus keys to match the sources', () => {
    expect(hata({ ...kartYap(), kaynakKayitIdleri: ['mevzuat:4721:m2'] }).join()).toContain(
      'kaynakKayitIdleri must be',
    );
    expect(kaynakKaydi({ kanunNo: '2709', madde: '11', bolum: 'madde' })).toBe('mevzuat:2709:m11');
    expect(kaynakKaydi({ kanunNo: '6216', madde: null, bolum: 'kunye' })).toBe('mevzuat:6216');
    expect(kaynakKaydi({ kanunNo: '334', madde: null, bolum: 'kunye' })).toBe('onceki-anayasa:334');
  });

  it('sets the verification date and the article fingerprint together', () => {
    const k = ilkKaynak(kartYap());
    expect(hata({ ...kartYap(), kaynaklar: [{ ...k, maddeOzeti: null }] }).join()).toContain('set together');
  });

  it('requires an https address on the cited site and the address parameters for mevzuat.gov.tr', () => {
    const k = ilkKaynak(kartYap());
    expect(
      hata({ ...kartYap(), kaynaklar: [{ ...k, url: 'http://www.mevzuat.gov.tr/x' }] }).length,
    ).toBeGreaterThan(0);
    expect(hata({ ...kartYap(), kaynaklar: [{ ...k, url: 'https://example.org/x' }] }).join()).toContain(
      'must be on',
    );
    expect(hata({ ...kartYap(), kaynaklar: [{ ...k, tertip: undefined }] }).join()).toContain('tertip');
  });

  it('refuses a long dash and an unknown HMGS area', () => {
    expect(
      hata({ ...kartYap(), aciklama: `Bu açıklama ${String.fromCharCode(0x2014)} uzun çizgi içerir, olmaz.` })
        .length,
    ).toBeGreaterThan(0);
    expect(hata({ ...kartYap(), hmgsAlani: 'kanun-disi' }).join()).toContain('unknown HMGS area');
  });

  it('keeps editors distinct and keeps the author from approving', () => {
    const e = { ad: 'Ayşe Yılmaz', tarih: '2026-11-08', surum: 1 };
    expect(hata({ ...kartYap(), editorler: [e, { ...e, ad: 'ayşe yılmaz' }] }).join()).toContain('only once');
    expect(hata({ ...kartYap(), hazirlayan: 'Ayşe Yılmaz', editorler: [e] }).join()).toContain('author');
  });

  it('checks deck level rules: id prefix, unique ids, area of the cards', () => {
    const deste = {
      sema: 1,
      slug: 'deneme-deste',
      baslik: 'Deneme',
      aciklama: 'Yalnız sınama için bir deste açıklaması.',
      hmgsAlani: null,
      kartlar: [kartYap()],
    };
    expect(desteSchema.safeParse(deste).success).toBe(true);
    expect(desteSchema.safeParse({ ...deste, kartlar: [kartYap(), kartYap()] }).success).toBe(false);
    expect(desteSchema.safeParse({ ...deste, slug: 'baska' }).success).toBe(false);
    expect(desteSchema.safeParse({ ...deste, hmgsAlani: 'medeni-hukuk' }).success).toBe(false);
  });
});

describe('card status is computed, never stored', () => {
  const editor = (ad: string, surum = 1) => ({ ad, tarih: '2026-11-08', surum });
  const dogrulanmamis = () => {
    const k = kartYap();
    return kartYap({ kaynaklar: [{ ...ilkKaynak(k), dogrulamaTarihi: null, maddeOzeti: null }] });
  };

  it('is a draft until the source is verified, whatever the approvals say', () => {
    expect(kartDurumu(dogrulanmamis())).toBe('taslak');
    expect(
      kartDurumu({ ...dogrulanmamis(), editorler: [editor('Ayşe Yılmaz'), editor('Mehmet Kaya')] }),
    ).toBe('taslak');
  });

  it('waits for approval when verified but not yet approved', () => {
    expect(kartDurumu(kartYap())).toBe('onay_bekliyor');
  });

  it('publishes a normal card with one editor and an HMGS card only with two different editors', () => {
    expect(gerekenOnay(false)).toBe(1);
    expect(gerekenOnay(true)).toBe(2);
    expect(kartDurumu(kartYap({ editorler: [editor('Ayşe Yılmaz')] }))).toBe('yayinda');
    const hmgs = kartYap({ hmgsAlani: 'medeni-hukuk', editorler: [editor('Ayşe Yılmaz')] });
    expect(kartDurumu(hmgs)).toBe('onay_bekliyor');
    expect(kartDurumu({ ...hmgs, editorler: [editor('Ayşe Yılmaz'), editor('Mehmet Kaya')] })).toBe(
      'yayinda',
    );
  });

  it('ignores approvals given for an older version', () => {
    const k = kartYap({ surum: 2, editorler: [editor('Ayşe Yılmaz', 1)] });
    expect(kartDurumu(k)).toBe('onay_bekliyor');
  });
});

describe('client view and identifiers', () => {
  it('never carries editor names, approvals or fingerprints to the client', () => {
    const k = kartYap({ editorler: [{ ad: 'Ayşe Yılmaz', tarih: '2026-11-08', surum: 1 }] });
    const json = JSON.stringify(kartGorunumu(k, 'deneme-deste'));
    expect(json).not.toContain('Ayşe');
    expect(json).not.toContain('editorler');
    expect(json).not.toContain('maddeOzeti');
    expect(json).not.toContain('hazirlayan');
  });

  it('turns quotations into law[] and sources into links[]', () => {
    const g = kartGorunumu(kartYap(), 'deneme-deste');
    expect(g.kanun).toEqual([
      { ref: 'Sınama Kanunu m.1', metin: 'Bu bir sınama alıntısıdır, gerçek değildir.' },
    ]);
    expect(g.baglantilar).toHaveLength(1);
    expect(g.baglantilar[0]?.url.startsWith('https://')).toBe(true);
  });

  it('gives the same version 5 UUID for the same id and different ones for different ids', () => {
    const a = kartUuid('anayasa-hukuku.001');
    expect(a).toBe(kartUuid('anayasa-hukuku.001'));
    expect(a).not.toBe(kartUuid('anayasa-hukuku.002'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
