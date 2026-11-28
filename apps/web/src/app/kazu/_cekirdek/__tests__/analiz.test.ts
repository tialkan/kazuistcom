import { describe, expect, it } from 'vitest';
import { BOS_CALISMA, bolumler, otomatikKontroller, type PmDugum } from '../analiz.ts';

const h = (t: string, level = 2): PmDugum => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text: t }],
});
const p = (t?: string): PmDugum => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] });

const govde: PmDugum = {
  type: 'doc',
  content: [
    p('Açılış cümlesi burada.'),
    h('Özet'),
    p('Bu çalışma bir iddia kurar.'),
    h('Giriş'),
    p('Önceden bilgilendirme yeterli değildir, buraya dayanak eklenecek.'),
    h('Alt konu', 3),
    p('Kaynak aranacak [[Yargıtay kararı]]'),
    h('Sonuç'),
    p(),
    h('Kaynakça'),
  ],
};

describe('bolumler', () => {
  it('splits the draft into sections with words and open notes', () => {
    expect(bolumler(govde)).toEqual([
      { baslik: '', seviye: 2, kelime: 3, not: 0 },
      { baslik: 'Özet', seviye: 2, kelime: 5, not: 0 },
      { baslik: 'Giriş', seviye: 2, kelime: 7, not: 1 },
      { baslik: 'Alt konu', seviye: 3, kelime: 4, not: 2 },
      { baslik: 'Sonuç', seviye: 2, kelime: 0, not: 0 },
      { baslik: 'Kaynakça', seviye: 2, kelime: 0, not: 0 },
    ]);
  });

  it('handles an empty draft', () => {
    expect(bolumler(null)).toEqual([]);
    expect(bolumler({ type: 'doc' })).toEqual([]);
  });
});

describe('otomatikKontroller', () => {
  it('flags a missing title, claim card, empty conclusion, open notes and sources without a location', () => {
    const c = {
      ...BOS_CALISMA,
      kaynaklar: [{ eser: 'A, Kitap', yer: '', iddia: 'x', tur: 'asil' as const }],
    };
    const k = Object.fromEntries(otomatikKontroller(govde, '', c).map((x) => [x.id, x]));
    expect(k.baslik?.durum).toBe('eksik');
    expect(k.iddia?.durum).toBe('eksik');
    expect(k.ozet?.durum).toBe('tamam');
    expect(k.sonuc?.durum).toBe('eksik');
    expect(k.bosBolum).toEqual({ id: 'bosBolum', durum: 'eksik', sayi: 1 });
    expect(k.not).toEqual({ id: 'not', durum: 'eksik', sayi: 3 });
    expect(k.kaynakYer).toEqual({ id: 'kaynakYer', durum: 'eksik', sayi: 1 });
  });

  it('passes a finished draft', () => {
    const bitmis: PmDugum = { type: 'doc', content: [h('Özet'), p('Var.'), h('Sonuç'), p('Var.')] };
    const c = {
      ...BOS_CALISMA,
      iddia: { sorun: 'a', cevap: 'b', yakin: 'c', katki: 'd' },
      kaynaklar: [{ eser: 'A', yer: 's. 4', iddia: 'x', tur: 'asil' as const }],
    };
    expect(otomatikKontroller(bitmis, 'Başlık', c).every((x) => x.durum === 'tamam')).toBe(true);
  });
});
