import { describe, expect, it } from 'vitest';
import { ORTA_CIZGI, UZUN_CIZGI } from './izler.ts';
import { denetle, kucukTr, parcala, type Sonuc } from './denetle.ts';

const kurallar = (s: Sonuc) => s.bulgular.map((b) => b.kural);
const parcalar = (s: Sonuc, kural: string) => s.bulgular.filter((b) => b.kural === kural).map((b) => b.parca);
const olcum = (s: Sonuc, anahtar: string) => s.olcumler.find((o) => o.anahtar === anahtar);

/** Plain academic sentences without any catalogue trace, used as a clean background. */
const TEMIZ =
  'Örneklem 214 öğrenciden oluştu. Veriler Mart 2025 ile Mayıs 2025 arasında toplandı. ' +
  'Anketin güvenirlik katsayısı 0,87 çıktı. İki grubun ortalamaları arasındaki fark küçüktü ve anlamlı değildi. ' +
  'Bulgular yalnız bu okulun üç şubesi için geçerlidir.';

describe('Turkish letter case (tr-TR)', () => {
  it('lower cases dotted and dotless I the Turkish way and keeps the length', () => {
    expect(kucukTr('IŞIK İSTANBUL')).toBe('ışık istanbul');
    expect(kucukTr('İ').length).toBe(1);
    expect(kucukTr('ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ')).toBe('abcçdefgğhıijklmnoöprsştuüvyz');
  });
  it('matches capital dotted İ phrases that a locale free lower casing would miss', () => {
    const s = denetle('BİLİNDİĞİ ÜZERE bu konu önemlidir.');
    expect(parcalar(s, '4.5')).toEqual(['BİLİNDİĞİ ÜZERE']);
  });
  it('matches capital I words that need the dotless form', () => {
    const s = denetle('Bu sonuç YADSINAMAZ bir gerçektir.');
    expect(parcalar(s, '4.1')).toEqual(['YADSINAMAZ']);
  });
  it('does not match the ASCII folded spelling of a Turkish phrase', () => {
    expect(kurallar(denetle('Bilindigi uzere bu konu tartisilir.'))).not.toContain('4.5');
  });
  it('reports offsets of the original text although the text is lower cased for matching', () => {
    const girdi = 'İİİ kilit İİİ';
    const b = denetle(girdi).bulgular.find((x) => x.kural === '4.1');
    expect(b && girdi.slice(b.baslangic, b.bitis)).toBe('kilit');
  });
});

describe('4.x word and phrase lists', () => {
  it('catches listed words with line and column', () => {
    const s = denetle('Birinci satır temiz.\nSon derece kapsamlı bir çalışma yürütüldü.');
    const b = s.bulgular.find((x) => x.kural === '4.1');
    expect(b).toMatchObject({ satir: 2, sutun: 1, parca: 'Son derece' });
    expect(kurallar(s)).toContain('4.2');
  });
  it('catches an inflected verb through its pattern', () => {
    expect(parcalar(denetle('Bu bulgu sorunun altını çizmiştir.'), '4.4')).toEqual(['altını çizmiştir']);
  });
  it('does not flag plain sentences or words that only share letters', () => {
    expect(denetle(TEMIZ).say.kesin + denetle(TEMIZ).say.olasi).toBe(0);
    // "sağlam" must not fire the verb "sağlamak"; "kilitlenmek" is not in the list
    const s = denetle('Veri sağlam bir tabana oturuyor. Kapı kilitlendi.');
    expect(parcalar(s, '4.11')).toEqual([]);
  });
  it('counts a sentence opener only at the start of a sentence', () => {
    expect(kurallar(denetle('Günümüzde veri çoktur.'))).toContain('4.5');
    expect(kurallar(denetle('Ölçüm günümüzde de sürüyor.'))).not.toContain('4.5');
  });
  it('flags three labels for the same person (4.9) but not two', () => {
    const uc = denetle('Katılımcı formu doldurdu. Denek yanıt verdi. Birey süreyi bildirdi.');
    expect(parcalar(uc, '4.9').length).toBe(3);
    const iki = denetle('Katılımcı formu doldurdu. Katılımcı yanıt verdi. Denek süreyi bildirdi.');
    expect(parcalar(iki, '4.9')).toEqual([]);
  });
  it('flags a connector that opens three paragraphs (4.6) but not two', () => {
    const uc = denetle('Ayrıca bir şey var.\n\nAyrıca başka şey var.\n\nAyrıca üçüncü şey var.');
    expect(parcalar(uc, '4.6').length).toBe(3);
    const iki = denetle('Ayrıca bir şey var.\n\nAyrıca başka şey var.\n\nÜçüncü şey var.');
    expect(parcalar(iki, '4.6')).toEqual([]);
  });
});

describe('chat leftovers and citation traces (4.8, 7.8)', () => {
  it('flags chat leftovers as certain traces', () => {
    const s = denetle('İşte düzeltilmiş metin:\nElbette, hemen yapıyorum. Umarım yardımcı olur.');
    const k = s.bulgular.filter((b) => b.kural === '4.8');
    expect(k.map((b) => b.siddet)).toEqual(['kesin', 'olasi', 'kesin']);
  });
  it('does not flag "elbette" inside a sentence', () => {
    expect(kurallar(denetle('Bu, elbette, tartışmaya açıktır.'))).not.toContain('4.8');
  });
  it('catches AI citation artefacts', () => {
    const metin =
      'Kaynak:contentReference[oaicite:0]{index=0} ve [cite: 12] ile turn0search0 ' +
      'https://x.org/a?utm_source=chatgpt.com ve utm_source=openai ve referrer=grok.com 【4†source】';
    const s = denetle(metin);
    const izler = s.bulgular.filter((b) => b.kural === '7.8').map((b) => b.parca);
    expect(izler.some((p) => p.startsWith(':contentReference'))).toBe(true);
    expect(izler).toEqual(
      expect.arrayContaining([
        '[cite: 12]',
        'turn0search0',
        'utm_source=chatgpt.com',
        'utm_source=openai',
        'referrer=grok.com',
      ]),
    );
    expect(s.say.kesin).toBeGreaterThanOrEqual(7);
  });
  it('matches the trace even when the text is typed in capitals', () => {
    expect(parcalar(denetle('OAICITE:1'), '7.8')).toEqual(['OAICITE:1']);
  });
  it('leaves ordinary brackets and links alone', () => {
    const s = denetle('Bkz. [1] ve https://doi.org/10.1000/xyz123 adresi. Sayfa 4 (Yılmaz, 2020).');
    expect(kurallar(s)).not.toContain('7.8');
  });
});

describe('dashes (6.12, 6.13)', () => {
  it('flags the long dash and the en dash, built from code points', () => {
    const s = denetle(`Sonuç ${UZUN_CIZGI} kesin. Yıllar 2019${ORTA_CIZGI}2024 arası.`);
    expect(kurallar(s)).toEqual(expect.arrayContaining(['6.12', '6.13']));
  });
  it('accepts the plain hyphen in ranges', () => {
    const s = denetle('Yıllar 2019-2024 arası, s. 45-52, saat 14.00-15.30.');
    expect(kurallar(s)).not.toContain('6.12');
    expect(kurallar(s)).not.toContain('6.13');
  });
});

describe('sentence ending ratio and rhythm (6.3, 5.19)', () => {
  const MEKTEDIR_METNI =
    'Bu çalışma yöntemi açıklamaktadır. Sonuçlar tabloda gösterilmektedir. Veriler analiz edilmektedir. ' +
    'Bulgular tartışılmaktadır. Öneriler sunulmaktadır. Sınırlılıklar belirtilmektedir.';
  it('measures the share of sentences ending in -mektedir and -dır', () => {
    const s = denetle(`${MEKTEDIR_METNI} Bu gerçektir. Karar budur. Yöntem açıktır. Sonuç bellidir.`);
    expect(s.ritim.cumleSayisi).toBe(10);
    expect(s.ritim.mektedirOrani).toBeCloseTo(0.6, 5);
    expect(s.ritim.dirOrani).toBeCloseTo(0.4, 5);
    expect(olcum(s, 'mektedirDir')?.uyari).toBe(true);
    // three in a row
    expect(s.bulgular.some((b) => b.kural === '6.3' && b.siddet === 'olasi')).toBe(true);
  });
  it('does not warn when the endings are mixed', () => {
    const s = denetle(
      'Verileri topladık. Katılımcılar formu doldurdu. Süre on dakika sürdü. Sonuçlar tabloda gösterilmektedir. ' +
        'Fark anlamlı değildi. Örneklem küçüktü.',
    );
    expect(s.ritim.mektedirOrani).toBeCloseTo(1 / 6, 5);
    expect(olcum(s, 'mektedirDir')?.uyari).toBe(false);
    expect(s.bulgular.filter((b) => b.kural === '6.3')).toEqual([]);
  });
  it('computes mean, spread and coefficient of variation of sentence length', () => {
    // lengths 2, 4, 6, 8, 10 -> mean 6, population sd sqrt(8)
    const s = denetle('A b. A b c d. A b c d e f. A b c d e f g h. A b c d e f g h i j.');
    expect(s.ritim.cumleSayisi).toBe(5);
    expect(s.ritim.ortalama).toBe(6);
    expect(s.ritim.enKisa).toBe(2);
    expect(s.ritim.enUzun).toBe(10);
    expect(s.ritim.sapma).toBeCloseTo(Math.sqrt(8), 6);
    expect(s.ritim.degiskenlik).toBeCloseTo(Math.sqrt(8) / 6, 6);
  });
  it('reports "not measured" for a short run of sentences', () => {
    const s = denetle('Kısa bir metin. İki cümle var.');
    expect(s.ritim.sapma).toBeNull();
    expect(s.ritim.degiskenlik).toBeNull();
    expect(olcum(s, 'degiskenlik')).toBeUndefined();
    expect(olcum(s, 'kisaMetin')?.uyari).toBe(true);
  });
  it('flags a run of equally long sentences and a low variation, but not a varied text', () => {
    const esit = Array.from(
      { length: 6 },
      (_, i) =>
        `Araştırmacı ${'kelime '.repeat(14 + (i % 3))}bulgu${i} üzerine görüş bildirdi ve tablo hazırladı.`,
    ).join(' ');
    const s = denetle(esit);
    expect(s.bulgular.some((b) => b.kural === '5.19')).toBe(true);
    expect(olcum(s, 'degiskenlik')?.uyari).toBe(true);
    const cesitli = denetle(
      'Kısa. ' +
        'Bu uzun cümle, örneklemin nasıl seçildiğini, hangi okullardan hangi koşullarda veri toplandığını ve neden bu yolun izlendiğini ayrıntılı biçimde açıklamak için kurulmuştur. ' +
        'Fark küçük. Ama yine de ölçülmesi gereken bir şey, çünkü ikinci yıl farklı çıkabilir ve bu durum karar vericiler için önemli sayılabilir. ' +
        'Bitti. İki okul.',
    );
    expect(cesitli.bulgular.some((b) => b.kural === '5.19')).toBe(false);
    expect(olcum(cesitli, 'degiskenlik')?.uyari).toBe(false);
  });
  it('does not split sentences at abbreviations, initials and decimals', () => {
    const s = denetle('Bkz. M. Kemal, s. 45-52 ve vb. kaynaklar 3.14 oranını verir. İkinci cümle burada.');
    expect(s.cumle).toBe(2);
  });
  it('keeps heading lines out of the sentence statistics', () => {
    const s = denetle('Giriş\n\nBu bir cümle. Bu başka bir cümle.');
    expect(s.cumle).toBe(2);
  });
});

describe('placeholders (2.10) and markers (2.2)', () => {
  it('flags unfilled placeholders and example links', () => {
    const s = denetle(
      '[Makale Başlığı] 2025-XX-XX KAYNAK_URL_EKLE https://example.com/a [Kurum Adı] Lorem ipsum dolor.',
    );
    expect(parcalar(s, '2.10')).toEqual([
      '[Makale Başlığı]',
      '2025-XX-XX',
      'KAYNAK_URL_EKLE',
      'example.com',
      '[Kurum Adı]',
      'Lorem ipsum',
    ]);
    expect(s.say.kesin).toBe(6);
  });
  it('reports the visible markers as information, not as a trace', () => {
    const s = denetle('Bu iddia [KAYNAK GEREKLİ] ve bu sayı [VERİ YOK].');
    expect(s.say.bilgi).toBe(2);
    expect(s.say.kesin + s.say.olasi + s.say.zayif).toBe(0);
    expect(s.yogunluk).toBe(0);
  });
  it('does not flag numeric brackets, years or real addresses', () => {
    const s = denetle('Bkz. [12], 2025-03-14 tarihli karar, https://www.resmigazete.gov.tr/ adresi.');
    expect(kurallar(s)).not.toContain('2.10');
  });
});

describe('Turkish patterns', () => {
  it('flags a sentence opening with "bir ... olarak" (6.25)', () => {
    expect(parcalar(denetle('Temel bir hak olarak mülkiyet korunur.'), '6.25')).toEqual([
      'Temel bir hak olarak',
    ]);
    expect(kurallar(denetle('Mülkiyet temel bir hak olarak korunur.'))).not.toContain('6.25');
  });
  it('flags a plural after a quantifier (6.26) but keeps the singular', () => {
    expect(parcalar(denetle('Birçok çalışmalarda üç farklı yöntemler denenmiştir.'), '6.26')).toEqual([
      'Birçok çalışmalarda',
      'üç farklı yöntemler',
    ]);
    expect(kurallar(denetle('Birçok çalışmada üç farklı yöntem denenmiştir.'))).not.toContain('6.26');
    // "on yıllarda" means decades and "altı çizilen" is not a number
    expect(kurallar(denetle('Son on yıllarda altı çizilen kavramlar değişti.'))).not.toContain('6.26');
  });
  it('flags needless "bir", "sahip olmak" and "sonuç olarak" (6.4, 6.5, 6.24)', () => {
    const s = denetle('Bu önemli bir faktördür. Model üç boyuta sahiptir. Sonuç olarak iş bitti.');
    expect(kurallar(s)).toEqual(expect.arrayContaining(['6.4', '6.5', '6.24']));
  });
  it('flags a comma after the opening conjunction and before "ama" (6.14)', () => {
    const s = denetle('Ancak, sonuç değişti. Etki anlamlı, ama küçüktür.');
    expect(parcalar(s, '6.14')).toEqual(['Ancak,', ', ama']);
    expect(kurallar(denetle('Ancak sonuç değişti. Etki anlamlı ama küçüktür.'))).not.toContain('6.14');
  });
  it('flags a percent sign after the number (6.11) and ordinal article numbers (6.28)', () => {
    const s = denetle(
      "Artış 15% oldu, %15 değil. 6098 sayılı Kanun'un 49'uncu Maddesi'ne göre karar verildi.",
    );
    expect(parcalar(s, '6.11')).toEqual(['15%']);
    expect(kurallar(s)).toContain('6.28');
    expect(kurallar(denetle('Artış %15 oldu. Kanunun 49. maddesine göre.'))).not.toContain('6.11');
  });
  it('flags a hollow "olması durumu" noun phrase (5.26)', () => {
    expect(kurallar(denetle('Yanıt vermeme durumunun yüksek olması durumu sorun yarattı.'))).toContain(
      '5.26',
    );
  });
});

describe('format traces (7.x)', () => {
  it('flags Markdown leftovers, bullets, emoji and hidden comments', () => {
    const s = denetle('## Başlık\n**kalın** yazı\n- madde\n✅ tamam <!-- not --> ↩\n---\n');
    const k = kurallar(s);
    expect(k).toEqual(expect.arrayContaining(['7.6', '7.1', '7.4', '7.10']));
    expect(s.bulgular.filter((b) => b.kural === '7.6').length).toBeGreaterThanOrEqual(3);
  });
  it('does not flag a hyphen inside a word, a plain sentence or a copyright sign', () => {
    const s = denetle('İş birliği ve yan-yana çalışma 2019-2024 arasında sürdü. © 2025 Yazar.');
    expect(kurallar(s).filter((x) => x.startsWith('7.'))).toEqual([]);
  });
  it('flags mixed quote styles as a measure (7.7)', () => {
    const s = denetle('Yazar "iyi" dedi ve “kötü” diye ekledi.');
    expect(olcum(s, 'tirnak')?.uyari).toBe(true);
    expect(olcum(denetle('Yazar “iyi” dedi ve “kötü” diye ekledi.'), 'tirnak')).toBeUndefined();
  });
  it('flags a change summary appended to the text (7.11)', () => {
    expect(kurallar(denetle('Metin burada.\nDeğişiklik özeti:\n1. şu'))).toContain('7.11');
  });
});

describe('result shape and honesty', () => {
  it('reports density per 1000 words and counts by severity, never a verdict', () => {
    const s = denetle('Günümüzde adeta kritik öneme sahiptir.');
    expect(s.sozcuk).toBe(5);
    expect(s.say.kesin + s.say.olasi + s.say.zayif).toBe(
      s.bulgular.filter((b) => b.siddet !== 'bilgi').length,
    );
    expect(s.yogunluk).toBeCloseTo((s.bulgular.length / 5) * 1000, 6);
    expect(Object.keys(s)).not.toEqual(expect.arrayContaining(['puan', 'olasilik', 'yapayZeka']));
  });
  it('returns an empty, finite result for an empty text', () => {
    const s = denetle('');
    expect(s.bulgular).toEqual([]);
    expect(s.yogunluk).toBeNull();
    expect(s.ritim.cumleSayisi).toBe(0);
  });
  it('counts connectors for the repetition table (10.4)', () => {
    const s = denetle('Ayrıca a. Ayrıca b. Bu nedenle c. Ayrıca d.');
    expect(s.tekrar[0]).toEqual({ ifade: 'ayrıca', adet: 3 });
  });
  it('splits the text into plain and marked pieces without losing a character', () => {
    const s = denetle('Günümüzde adeta kritik öneme sahiptir ve bu doğrudur.');
    const p = parcala(s.metin, s.bulgular);
    expect(p.map((x) => x.metin).join('')).toBe(s.metin);
    expect(p.some((x) => x.bulgular.length > 0)).toBe(true);
  });
  it('handles a large text within a sensible time', () => {
    const buyuk = `${TEMIZ} Günümüzde adeta kapsamlı bir çalışma. `.repeat(1200);
    const t0 = performance.now();
    const s = denetle(buyuk.slice(0, 100_000));
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(s.bulgular.length).toBeGreaterThan(1000);
  });
});
