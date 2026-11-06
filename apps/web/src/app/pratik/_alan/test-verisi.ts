/** Synthetic cards for tests only: they never ship in a deck and cite no real provision. */
import { hmgsAlanlari } from './hmgs-alanlari.ts';
import { kartGorunumu, kartSchema, type Kart, type KartGorunumu } from './kart.ts';

export function ilkKaynak(k: Kart) {
  const x = k.kaynaklar[0];
  if (!x) throw new Error('card has no source');
  return x;
}

export function kartYap(ek: Partial<Kart> = {}): Kart {
  return kartSchema.parse({
    id: 'deneme-deste.001',
    oyun: 'olay_karti',
    soru: 'Bu bir sınama sorusudur ve gerçek bir hükme dayanmaz.',
    secenekler: ['Birinci hüküm', 'İkinci hüküm', 'Üçüncü hüküm', 'Dördüncü hüküm', 'Beşinci hüküm'],
    dogruIndex: 1,
    aciklama: 'Bu açıklama yalnız birim sınamaları içindir, gerçek bir mevzuata dayanmaz.',
    kaynaklar: [
      {
        kaynak: 'mevzuat.gov.tr',
        kanunNo: '4721',
        kanunAdi: 'Sınama Kanunu',
        madde: '1',
        bolum: 'madde',
        url: 'https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=4721&MevzuatTur=1&MevzuatTertip=5',
        mevzuatTur: 1,
        tertip: 5,
        alintilar: ['Bu bir sınama alıntısıdır, gerçek değildir.'],
        dogrulamaTarihi: '2026-11-07',
        maddeOzeti: '0123456789abcdef',
      },
    ],
    hmgsAlani: null,
    zorluk: 1,
    kaynakKayitIdleri: ['mevzuat:4721:m1'],
    hazirlayan: 'yz_taslagi',
    editorler: [],
    surum: 1,
    guncelleme: '2026-11-07',
    ...ek,
  });
}

/** A pool with `kota + fazla` five choice cards in every HMGS area. */
export function sentetikHavuz(fazla = 2, alanlar = hmgsAlanlari.map((a) => a.slug)): KartGorunumu[] {
  const gorunumler: KartGorunumu[] = [];
  for (const slug of alanlar) {
    const alan = hmgsAlanlari.find((a) => a.slug === slug);
    if (!alan) continue;
    for (let i = 1; i <= alan.denemeSorusu + fazla; i++) {
      const kart = kartYap({
        id: `${slug}.${String(i).padStart(3, '0')}`,
        hmgsAlani: slug,
        dogruIndex: i % 5,
      });
      gorunumler.push(kartGorunumu(kart, slug));
    }
  }
  return gorunumler;
}
