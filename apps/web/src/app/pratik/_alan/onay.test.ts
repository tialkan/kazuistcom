import { describe, expect, it } from 'vitest';
import { kartDurumu } from './kart.ts';
import { OnayHatasi, degistir, desteDurumuOzeti, onayKuyrugu, onayla, onaylayabilir } from './onay.ts';
import { ilkKaynak, kartYap } from './test-verisi.ts';

const T = '2026-11-08';

describe('two editor approval flow', () => {
  it('lets two different editors publish an HMGS card, one after the other', () => {
    let k = kartYap({ hmgsAlani: 'medeni-hukuk' });
    expect(kartDurumu(k)).toBe('onay_bekliyor');
    k = onayla(k, 'Ayşe Yılmaz', T, true);
    expect(kartDurumu(k)).toBe('onay_bekliyor');
    k = onayla(k, 'Mehmet Kaya', T, true);
    expect(kartDurumu(k)).toBe('yayinda');
    expect(k.editorler.map((e) => e.ad)).toEqual(['Ayşe Yılmaz', 'Mehmet Kaya']);
  });

  it('refuses the same editor twice, with any letter case', () => {
    const k = onayla(kartYap({ hmgsAlani: 'medeni-hukuk' }), 'Ayşe Yılmaz', T, true);
    expect(onaylayabilir(k, 'AYŞE YILMAZ', true)).toEqual({ evet: false, neden: 'tekrar' });
    expect(() => onayla(k, 'ayşe yılmaz', T, true)).toThrow(OnayHatasi);
  });

  it('refuses the author and a card whose source is not verified', () => {
    const yazar = kartYap({ hazirlayan: 'Zeynep Demir' });
    expect(onaylayabilir(yazar, 'Zeynep Demir', false)).toEqual({ evet: false, neden: 'yazar' });
    const k = kartYap();
    const dogrulanmamis = kartYap({
      kaynaklar: [{ ...ilkKaynak(k), dogrulamaTarihi: null, maddeOzeti: null }],
    });
    expect(onaylayabilir(dogrulanmamis, 'Ayşe Yılmaz', false)).toEqual({
      evet: false,
      neden: 'kaynak_dogrulanmadi',
    });
    expect(onaylayabilir(k, 'Al', false)).toEqual({ evet: false, neden: 'ad' });
  });

  it('refuses a third approval once the card has all it needs', () => {
    const k = onayla(kartYap(), 'Ayşe Yılmaz', T, false);
    expect(onaylayabilir(k, 'Mehmet Kaya', false)).toEqual({ evet: false, neden: 'gerek_yok' });
  });

  it('puts the card back into review when the question, the answer or the source changes', () => {
    const yayinda = onayla(kartYap(), 'Ayşe Yılmaz', T, false);
    expect(kartDurumu(yayinda)).toBe('yayinda');
    const soru = degistir(
      yayinda,
      { soru: 'Soru metni değişti ve artık başka bir şey soruyor.' },
      '2026-11-09',
    );
    expect(soru.surum).toBe(2);
    expect(kartDurumu(soru)).toBe('onay_bekliyor');
    const cevap = degistir(yayinda, { dogruIndex: 2 }, '2026-11-09');
    expect(kartDurumu(cevap)).toBe('onay_bekliyor');
    const kaynak = degistir(yayinda, { kaynaklar: [{ ...ilkKaynak(yayinda), madde: '2' }] }, '2026-11-09');
    expect(kartDurumu(kaynak)).toBe('taslak');
    expect(kaynak.kaynaklar[0]?.dogrulamaTarihi).toBeNull();
  });

  it('keeps the version when nothing changed', () => {
    const k = onayla(kartYap(), 'Ayşe Yılmaz', T, false);
    expect(degistir(k, { soru: k.soru, secenekler: k.secenekler }, '2026-11-09')).toBe(k);
  });

  it('lists unpublished cards, the ones ready for an editor before drafts', () => {
    const hazir = kartYap({ id: 'deneme-deste.002' });
    const taslak = kartYap({
      id: 'deneme-deste.001',
      kaynaklar: [{ ...ilkKaynak(hazir), dogrulamaTarihi: null, maddeOzeti: null }],
    });
    const yayinda = onayla(kartYap({ id: 'deneme-deste.003' }), 'Ayşe Yılmaz', T, false);
    const deste = {
      sema: 1 as const,
      slug: 'deneme-deste',
      baslik: 'Deneme',
      aciklama: 'Yalnız sınama için.',
      hmgsAlani: null,
      kartlar: [taslak, hazir, yayinda],
    };
    const kuyruk = onayKuyrugu([deste]);
    expect(kuyruk.map((s) => [s.kart.id, s.durum])).toEqual([
      ['deneme-deste.002', 'onay_bekliyor'],
      ['deneme-deste.001', 'taslak'],
    ]);
    expect(desteDurumuOzeti(deste)).toEqual({ yayinda: 1, onayBekliyor: 1, taslak: 1 });
  });
});
