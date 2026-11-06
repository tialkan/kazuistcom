/**
 * Trace catalogue of the checker. Every entry points at a rule id of docs/tespit/yazim-kurallari.md.
 * The rule text is the single source: `terim` is the literal word or phrase quoted in that rule (a test
 * proves it appears in the rule), `desen` only widens it for inflection. Entries without a literal
 * (pure patterns such as citation traces) carry a sample that the test must see matched.
 * Patterns are written in lower case and run against Turkish lower cased text (I becomes dotless i), so
 * ASCII words that contain "i" use the class [iı] where the original case may be capital.
 */

export type Siddet = 'kesin' | 'olasi' | 'zayif' | 'bilgi';

export type Aile =
  'sohbet' | 'atif' | 'yerTutucu' | 'cizgi' | 'sozcuk' | 'kalip' | 'ritim' | 'bicim' | 'turkce' | 'dogruluk';

export interface Iz {
  kural: string;
  aile: Aile;
  siddet: Siddet;
  /** Literal quoted in the rule text; verified against the rule by a test. */
  terim?: string;
  /** Regular expression source (lower case text). Defaults to the escaped `terim`. */
  desen: string;
  /** Text that must match, used by the self test. Defaults to `terim`. */
  ornek: string;
  /** Word boundaries on both sides (default true). */
  sinir: boolean;
  /** Matched against the original case text instead of the lower cased one. */
  orijinal: boolean;
  /** Only counts at the beginning of a sentence. */
  cumleBasi: boolean;
}

const kacis = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Girdi = string | { terim: string; desen?: string; ornek?: string; cumleBasi?: boolean; siddet?: Siddet };

function grup(kural: string, aile: Aile, siddet: Siddet, girdiler: Girdi[]): Iz[] {
  return girdiler.map((g) => {
    const o = typeof g === 'string' ? { terim: g } : g;
    return {
      kural,
      aile,
      siddet: ('siddet' in o && o.siddet) || siddet,
      terim: o.terim,
      desen: ('desen' in o && o.desen) || kacis(o.terim.toLocaleLowerCase('tr-TR')),
      ornek: ('ornek' in o && o.ornek) || o.terim,
      sinir: true,
      orijinal: false,
      cumleBasi: 'cumleBasi' in o && o.cumleBasi === true,
    };
  });
}

interface DesenGirdi {
  desen: string;
  ornek: string;
  sinir?: boolean;
  orijinal?: boolean;
}
function desenler(kural: string, aile: Aile, siddet: Siddet, girdiler: DesenGirdi[]): Iz[] {
  return girdiler.map((g) => ({
    kural,
    aile,
    siddet,
    desen: g.desen,
    ornek: g.ornek,
    sinir: g.sinir ?? false,
    orijinal: g.orijinal ?? false,
    cumleBasi: false,
  }));
}

/** Dashes are produced from code points so that no source file contains the characters themselves. */
export const UZUN_CIZGI = String.fromCharCode(0x2014);
export const ORTA_CIZGI = String.fromCharCode(0x2013);

/** A plural suffix right after a quantifier word (6.26). KELIMELER is replaced by the quantifier list.
 * A genitive in between ("iki grubun ortalamaları") is correct Turkish and is skipped. */
const PLURAL =
  '(?<![\\p{L}\\p{N}])(?:KELIMELER)\\s+(?:(?!\\p{L}*[ıiuü]n(?!\\p{L}))\\p{L}+\\s+)?\\p{L}{2,}(?:lar|ler)(?:da|de|dan|den|ın|in|ı|i|a|e|la|le)?(?![\\p{L}\\p{N}])';

/**
 * Order matters: when two entries match the same span, the earlier one wins, so the specific rule comes
 * before the general one.
 */
export const izler: Iz[] = [
  // Chat, approval and correspondence leftovers (4.8). They have no place in a manuscript.
  ...grup('4.8', 'sohbet', 'kesin', [
    'Harika bir soru',
    'Çok haklısınız',
    'Harika bir tespit',
    'Mükemmel bir soru',
    { terim: 'Umarım yardımcı olur', desen: 'umarım (?:bu )?yardımcı ol\\p{L}*' },
    'İşte düzeltilmiş metin',
    'Başka bir şey ister misiniz',
    'Bilgi kesim tarihim itibarıyla',
    { terim: 'Bir yapay zekâ olarak', desen: 'bir yapay zek[âa] olarak', ornek: 'Bir yapay zekâ olarak' },
    'Umarım bu mesaj sizi iyi bulur',
    'Değerli vaktinizi ayırdığınız için teşekkür ederim',
  ]),
  ...grup('4.8', 'sohbet', 'olasi', [
    { terim: 'Elbette', cumleBasi: true },
    { terim: 'Tabii ki', cumleBasi: true },
    { terim: 'İsterseniz', cumleBasi: true },
  ]),

  // Citation traces of AI tools (7.8). Pure patterns, no word boundaries.
  ...desenler('7.8', 'atif', 'kesin', [
    { desen: '\\[cite:\\s*[\\d,\\s]+\\]', ornek: '[cite: 1]' },
    {
      desen: ':?contentreference(?:\\[[^\\]\\n]*\\])?(?:\\{[^}\\n]*\\})?',
      ornek: ':contentReference[oaicite:0]{index=0}',
    },
    { desen: 'oa[iı]c[iı]te(?::\\d+)?', ornek: 'oaicite:3' },
    { desen: 'turn\\d+(?:search|view|news|image|file|forecast)\\d+', ornek: 'turn0search0' },
    { desen: 'utm_source=(?:chatgpt\\.com|opena[iı])', ornek: 'utm_source=chatgpt.com' },
    { desen: 'referrer=grok\\.com', ornek: 'referrer=grok.com' },
    { desen: '[\\u3010\\u3011]', ornek: '【' },
    { desen: '[\\ue200-\\ue206]', ornek: '' },
    { desen: '\\u2020', ornek: '†' },
  ]),

  // Unfilled placeholders (2.10) and visible markers (2.2).
  ...desenler('2.10', 'yerTutucu', 'kesin', [
    {
      desen: '\\[[A-ZÇĞİÖŞÜ][a-zçğıöşüâîû]+(?:\\s+[A-ZÇĞİÖŞÜ]?[a-zçğıöşüâîû]+){1,4}\\]',
      ornek: '[Makale Başlığı]',
      orijinal: true,
    },
    {
      desen: '\\[(?:Tarih|Başlık|Yazar|Kurum|Ad|Soyad|URL|Link|Bağlantı|Kaynak)\\]',
      ornek: '[Kurum]',
      orijinal: true,
    },
    {
      desen: '(?<![\\p{L}\\p{N}])(?:\\d{4}-)?x{2,4}-x{2,4}(?:-x{2,4})?(?![\\p{L}\\p{N}])',
      ornek: '2025-XX-XX',
    },
    { desen: '[a-z0-9]+(?:_[a-z0-9]+)*_(?:ekle|buraya|yaz)(?![\\p{L}\\p{N}])', ornek: 'KAYNAK_URL_EKLE' },
    {
      desen: '(?<![\\p{L}\\p{N}.])(?:www\\.)?example\\.(?:com|org|net)',
      ornek: 'https://example.com/makale',
    },
    { desen: 'lorem [iı]psum', ornek: 'Lorem ipsum' },
  ]),
  ...desenler('2.2', 'dogruluk', 'bilgi', [
    {
      desen: '\\[(?:kaynak gerekli|veri yok|doğrulanamadı|yazar kontrol etmeli)\\]',
      ornek: '[KAYNAK GEREKLİ]',
    },
  ]),

  // Claims about detector scores (2.8) and unfounded absence claims (2.11).
  ...desenler('2.8', 'dogruluk', 'olasi', [
    { desen: '%\\s?\\d+\\s+(?:yapay zek[âa]|insan)', ornek: '%0 yapay zekâ' },
    { desen: 'tespit edilemez', ornek: 'tespit edilemez' },
  ]),
  ...grup('2.8', 'dogruluk', 'zayif', ['kusursuz']),
  ...grup('2.11', 'dogruluk', 'olasi', [
    { terim: 'ayrıntılı bilgi bulunmamaktadır', desen: 'ayrıntılı bilgi bulunma\\p{L}*' },
    { terim: 'kaynaklarda yer almamaktadır', desen: 'kaynaklarda yer alma\\p{L}*' },
    'kamuya açık değildir',
  ]),

  // 4.1 empty importance and exaggeration
  ...grup('4.1', 'sozcuk', 'olasi', [
    { terim: 'önemli bir rol oynamaktadır', desen: 'önemli bir rol oyna\\p{L}*' },
    { terim: 'kritik öneme sahiptir', desen: 'kritik önem\\p{L}* sahip\\p{L}*' },
    { terim: 'büyük önem arz etmektedir', desen: 'büyük önem arz \\p{L}+' },
    'oldukça önemli',
    'göz ardı edilemez',
    'son derece',
    'dönüm noktası',
    'mihenk taşı',
    'temel taşı',
  ]),
  ...grup('4.1', 'sozcuk', 'zayif', [
    'hayati',
    'kilit',
    'belirleyici',
    'kayda değer',
    'dikkate değer',
    'yadsınamaz',
    'kaçınılmaz',
  ]),
  // 4.2 value adjectives instead of grounds
  ...grup('4.2', 'sozcuk', 'zayif', [
    { terim: 'kapsamlı', desen: 'kapsamlı\\p{L}{0,6}' },
    { terim: 'titiz', desen: 'titiz\\p{L}{0,6}' },
    'çok boyutlu',
    'çok yönlü',
    { terim: 'dinamik', desen: 'dinamik\\p{L}{0,6}' },
    { terim: 'yenilikçi', desen: 'yenilikçi\\p{L}{0,6}' },
    'çığır açan',
    { terim: 'zengin', desen: 'zengin\\p{L}{0,6}' },
    { terim: 'güçlü', desen: 'güçlü\\p{L}{0,6}' },
    'sağlam',
    { terim: 'etkili', desen: 'etkili\\p{L}{0,6}' },
    { terim: 'değerli', desen: 'değerli\\p{L}{0,6}' },
    'eşsiz',
    'benzersiz',
  ]),
  // 4.3 metaphor and ornament
  ...grup('4.3', 'sozcuk', 'olasi', [
    { terim: 'ışık tutmak', desen: 'ışık tut\\p{L}*' },
    { terim: 'kapı aralamak', desen: 'kapı aral\\p{L}*' },
    { terim: 'köprü kurmak', desen: 'köprü kur\\p{L}*' },
    'yol haritası',
    { terim: 'keşfe çıkmak', desen: 'keşfe çık\\p{L}*' },
  ]),
  ...grup('4.3', 'sozcuk', 'zayif', [
    'yolculuk',
    'serüven',
    'mozaik',
    'manzara',
    'peyzaj',
    'panorama',
    { terim: 'harmanlamak', desen: 'harmanla\\p{L}*' },
    { terim: 'sentezlemek', desen: 'sentezle\\p{L}*' },
  ]),
  // 4.4 shallow emphasis verbs
  ...grup('4.4', 'sozcuk', 'olasi', [
    { terim: 'vurgulamaktadır', desen: 'vurgula\\p{L}*' },
    { terim: 'altını çizmektedir', desen: 'altını çiz\\p{L}*' },
    { terim: 'ön plana çıkarmaktadır', desen: 'ön plana çıkar\\p{L}*' },
    { terim: 'gözler önüne sermektedir', desen: 'gözler önüne ser\\p{L}*' },
    { terim: 'yansıtmaktadır', desen: 'yansıt\\p{L}*' },
    { terim: 'sembolize etmektedir', desen: 'sembolize et\\p{L}*' },
    { terim: 'katkı sunmaktadır', desen: 'katkı sun\\p{L}*' },
    { terim: 'zemin hazırlamaktadır', desen: 'zemin hazırla\\p{L}*' },
    { terim: 'şekillendirmektedir', desen: 'şekillendir\\p{L}*' },
    { terim: 'pekiştirmektedir', desen: 'pekiştir\\p{L}*' },
    { terim: 'güçlendirmektedir', desen: 'güçlendir\\p{L}*' },
    { terim: 'teşvik etmektedir', desen: 'teşvik et\\p{L}*' },
    { terim: 'beslemektedir', desen: 'besle(?:mekte|miş|di|r)\\p{L}*' },
  ]),
  // 4.5 stock openings
  ...grup('4.5', 'kalip', 'olasi', [
    { terim: 'Günümüzde', cumleBasi: true },
    { terim: 'Son yıllarda', cumleBasi: true },
    'Teknolojinin hızla geliştiği çağımızda',
    'Küreselleşen dünyada',
    { terim: 'Tarih boyunca', cumleBasi: true },
    'İnsanlık tarihi boyunca',
    'Bilindiği üzere',
    { terim: 'Hiç şüphesiz', cumleBasi: true },
    { terim: 'Kuşkusuz', cumleBasi: true },
  ]),
  // 4.6 stock transitions and filler
  ...grup('4.6', 'kalip', 'zayif', [
    'Bu bağlamda',
    'Bu çerçevede',
    'Bu doğrultuda',
    'Bu noktada',
    'Unutulmamalıdır ki',
    'Belirtmek gerekir ki',
    'Şunu da eklemek gerekir ki',
    'Göz önünde bulundurulduğunda',
  ]),
  // 4.7 vague attribution
  ...grup('4.7', 'kalip', 'olasi', [
    'birçok çalışma',
    { terim: 'araştırmalar göstermektedir', desen: 'araştırmalar göster\\p{L}*' },
    { terim: 'literatürde genel kabul görmektedir', desen: 'literatürde genel kabul gör\\p{L}*' },
    'yaygın olarak kabul edilmektedir',
  ]),
  ...grup('4.7', 'kalip', 'zayif', ['uzmanlar', 'araştırmacılar', 'eleştirmenler']),
  // 4.10 single sighting traces
  ...grup('4.10', 'sozcuk', 'olasi', [
    'adeta',
    { terim: 'mercek altına almak', desen: 'mercek altına al\\p{L}*' },
    { terim: 'derinlemesine inmek', desen: 'derinlemesine in(?:mek|ir|er|erek|il\\p{L}*|di\\p{L}*)' },
    'nişanesidir',
    { terim: 'kanıtıdır', desen: '(?:bir )?kanıtıdır' },
    'en büyük göstergesidir',
    { terim: 'kalbinde yer alan', desen: 'kalbinde yer al\\p{L}*' },
    { terim: 'potansiyelini ortaya çıkarmak', desen: 'potansiyelini ortaya çıkar\\p{L}*' },
    { terim: 'kilidini açmak', desen: 'kilidini aç\\p{L}*' },
    'geniş bir yelpazede',
    'zengin bir doku',
    'pürüzsüzce',
    'zahmetsizce',
    'titizlikle hazırlanmış',
  ]),
  // 4.11 hollow helper verbs
  ...grup('4.11', 'sozcuk', 'zayif', [
    { terim: 'gerçekleştirmek', desen: 'gerçekleştir\\p{L}*' },
    { terim: 'sağlamak', desen: 'sağla(?:ma|mak|mış|r|y|n|dı|nı)\\p{L}*' },
    { terim: 'katkıda bulunmak', desen: 'katkıda bulun\\p{L}*' },
    { terim: 'yardımcı olmak', desen: 'yardımcı ol\\p{L}*' },
    { terim: 'ev sahipliği yapmak', desen: 'ev sahipliği yap\\p{L}*' },
    { terim: 'rol oynamak', desen: 'rol oyna\\p{L}*' },
    { terim: 'icra etmek', desen: 'icra et\\p{L}*' },
  ]),
  // 4.12 corporate jargon
  ...grup('4.12', 'sozcuk', 'olasi', [
    'sinerji',
    'paradigma',
    'holistik',
    'bütüncül yaklaşım',
    'proaktif',
    'dinamik yapı',
    'ekosistem',
    'katma değer',
    { terim: 'farkındalık yaratmak', desen: 'farkındalık yarat\\p{L}*' },
  ]),
  ...grup('4.12', 'sozcuk', 'zayif', ['sürdürülebilir']),
  // 4.13 announced emphasis
  ...grup('4.13', 'kalip', 'olasi', [
    'Şunu vurgulamak önemlidir ki',
    'Dikkat çekici bir şekilde',
    'İlginç bir şekilde',
    'İşte tam da bu noktada',
    'Asıl önemli olan şey şudur ki',
    'Altı çizilmesi gereken husus',
  ]),
  // 4.14 reference filler (established legal references are not a trace, see the rule)
  ...grup('4.14', 'kalip', 'zayif', ['söz konusu', 'bahsi geçen', 'mezkûr', 'adı geçen']),
  // 4.15 marketing translation
  ...grup('4.15', 'kalip', 'olasi', [
    { terim: 'bir üst seviyeye taşımak', desen: 'bir üst seviyeye taşı\\p{L}*' },
    'oyunun kurallarını değiştiren',
    'hepsi bir arada',
    'ihtiyaçlarınıza özel tasarlanmış',
    { terim: 'değer katmak', desen: 'değer kat\\p{L}*' },
    { terim: 'fark yaratmak', desen: 'fark yarat\\p{L}*' },
    { terim: 'kaldıraç olarak kullanmak', desen: 'kaldıraç olarak kullan\\p{L}*' },
  ]),
  // 4.16 vague relation
  ...grup('4.16', 'kalip', 'olasi', [
    'ile bağlantılı olarak',
    'ile ilişkili olarak',
    'ile bağlantılıdır',
    { terim: 'ile ilişkilendirilmektedir', desen: 'ile ilişkilendiril\\p{L}*' },
  ]),
  // 4.17 filler hedges
  ...grup('4.17', 'kalip', 'olasi', [
    'Mevcut bilgilere göre',
    'Eldeki verilere dayanarak',
    'Ayrıntılar sınırlı olsa da',
    'Kesin bilgi bulunmamakla birlikte',
  ]),
  // 4.18 lively verbs on lifeless subjects
  ...grup('4.18', 'kalip', 'olasi', [
    'veriler konuşuyor',
    'rakamlar haykırıyor',
    'model hatayı yutuyor',
    'piyasa nefes alıyor',
  ]),
  // 4.19 coinages
  ...grup('4.19', 'sozcuk', 'olasi', [
    { terim: 'dipnotlamak', desen: 'dipnotla\\p{L}*' },
    { terim: 'kaynaklandırmak', desen: 'kaynaklandır\\p{L}*' },
    { terim: 'vakalaştırmak', desen: 'vakalaştır\\p{L}*' },
    'hukuksallaştırılmış',
  ]),
  // 4.20 words of the moment
  ...grup('4.20', 'sozcuk', 'zayif', [
    { terim: 'derinlemesine incelemek', desen: 'derinlemesine incele\\p{L}*' },
  ]),
  // 4.21 calqued academic adverbs
  ...grup('4.21', 'kalip', 'olasi', [
    'doğası gereği',
    'özünde',
    'nihai olarak',
    'kaçınılmaz olarak',
    'paradoksal olarak',
    'tartışmasız biçimde',
  ]),
  // 4.22 two sided clichés
  ...grup('4.22', 'kalip', 'olasi', [
    'iki ucu keskin bıçak',
    'madalyonun diğer yüzü',
    'hem bir risk hem bir fırsat',
    'fırsatlar ve tehditler barındıran',
    'hassas bir denge',
  ]),
  // 4.23 fake debate openings
  ...grup('4.23', 'kalip', 'olasi', [
    'Literatürde bu konuda tam bir fikir birliği bulunmamakla birlikte',
    'Tartışmalar devam etse de',
    'Farklı görüşler mevcut olmakla beraber',
  ]),

  // Section 5: sentence and paragraph level phrases
  ...grup('5.1', 'kalip', 'olasi', [
    'olarak hizmet vermektedir',
    { terim: 'işlev görmektedir', desen: 'işlev gör\\p{L}*' },
    { terim: 'temsil etmektedir', desen: 'temsil et\\p{L}*' },
    { terim: 'niteliği taşımaktadır', desen: 'niteliği taşı\\p{L}*' },
    { terim: 'barındırmaktadır', desen: 'barındır\\p{L}*' },
  ]),
  ...grup('5.2', 'kalip', 'olasi', [
    { terim: 'önemini bir kez daha ortaya koymaktadır', desen: 'önemini bir kez daha ortaya koy\\p{L}*' },
  ]),
  ...grup('5.3', 'kalip', 'zayif', [
    {
      terim: 'aynı zamanda',
      desen: '(?:yalnızca|yalnız|sadece)\\s[^.!?\\n]{1,120}?\\sdeğil,?\\s(?:aynı zamanda|ayrıca)',
      ornek: 'Yalnızca hızı değil, aynı zamanda doğruluğu artırır',
    },
  ]),
  ...grup('5.5', 'kalip', 'zayif', [
    {
      terim: 'Peki',
      desen: 'peki\\s[^.!?\\n]{1,120}\\?',
      ornek: 'Peki bu neden önemlidir?',
    },
  ]),
  ...grup('5.8', 'kalip', 'olasi', [
    { terim: 'zorluklarla karşı karşıyadır', desen: 'zorluklarla karşı karşıya\\p{L}*' },
  ]),
  ...grup('5.10', 'kalip', 'zayif', [
    'her alanda',
    'tüm dünyada',
    { terim: 'her geçen gün daha fazla', desen: 'her geçen gün' },
  ]),
  ...grup('5.11', 'kalip', 'zayif', [{ terim: 'gelin birlikte bakalım', desen: 'gelin birlikte' }]),
  ...grup('5.12', 'kalip', 'olasi', [
    {
      terim: 'bu çalışma alana önemli bir katkı sunmaktadır',
      desen: 'alana (?:önemli )?(?:bir )?katkı sun\\p{L}*',
      ornek: 'alana önemli bir katkı sunmaktadır',
    },
  ]),
  ...grup('5.16', 'kalip', 'zayif', [
    {
      terim: 'Öyle bir',
      desen: 'öyle bir [^.!?\\n]{1,40}? ki(?![\\p{L}\\p{N}])',
      ornek: 'öyle bir durum ki',
    },
    'Şunu söylemek gerekir ki',
    { terim: 'Görülmektedir ki', desen: 'görülmekte(?:dir)? ki' },
  ]),
  ...grup('5.20', 'kalip', 'zayif', [
    { terim: 'Burada asıl mesele', desen: 'burada asıl mesele\\p{L}*' },
    { terim: 'belirleyen şey', desen: 'belirleyen şey\\p{L}*', ornek: "X'i belirleyen şey Y'dir" },
  ]),
  ...grup('5.24', 'kalip', 'olasi', [
    'Zorluklar ve Gelecek Perspektifleri',
    'Ödüller ve Tanınırlık',
    'Önemi ve Etkisi',
  ]),
  ...grup('5.25', 'kalip', 'zayif', [
    {
      terim: 'her iki yaklaşımın da haklı yönleri vardır',
      desen: 'her iki (?:yaklaşımın|görüşün) da haklı yönleri',
      ornek: 'her iki yaklaşımın da haklı yönleri vardır',
    },
  ]),
  ...grup('5.26', 'turkce', 'olasi', [
    {
      terim: 'olması durumu',
      desen: '\\p{L}+(?:ması|mesi) (?:durumu|h[âa]li|olgusu)(?![\\p{L}\\p{N}])',
      ornek: 'yüksek olması durumu',
    },
  ]),

  // Section 6: Turkish specific problems
  ...grup('6.2', 'turkce', 'zayif', ['tarafından']),
  ...grup('6.3', 'turkce', 'zayif', [
    { terim: 'mekte olan', desen: '\\p{L}*(?:mekte|makta) olan', ornek: 'bulunmakta olan' },
    {
      terim: 'mış bulunmaktadır',
      desen: '\\p{L}*(?:mış|miş|muş|müş) bulunmakta\\p{L}*',
      ornek: 'edilmiş bulunmaktadır',
    },
  ]),
  ...grup('6.4', 'turkce', 'zayif', [
    { terim: 'önemli bir faktördür', desen: 'önemli bir faktör\\p{L}*' },
    { terim: 'büyük bir önem', desen: 'büyük bir önem\\p{L}*' },
    { terim: 'ciddi bir artış', desen: 'ciddi bir artış\\p{L}*' },
  ]),
  ...grup('6.5', 'turkce', 'zayif', [
    { terim: 'sahiptir', desen: 'sahiptir' },
    { terim: 'sahip olmak', desen: 'sahip ol\\p{L}*' },
  ]),
  ...grup('6.8', 'turkce', 'zayif', ['ile ilgili olarak', 'açısından bakıldığında']),
  ...grup('6.24', 'turkce', 'zayif', ['sonuç olarak', 'ilk adım olarak', 'temel olarak']),
  ...grup('6.27', 'turkce', 'olasi', [
    { terim: 'kendini göstermektedir', desen: 'kendini göster\\p{L}*' },
    { terim: 'kendi içinde barındırmaktadır', desen: 'kendi içinde barındır\\p{L}*' },
    { terim: 'kendine yer bulmaktadır', desen: 'kendine yer bul\\p{L}*' },
  ]),
  ...desenler('6.11', 'turkce', 'zayif', [
    { desen: '(?<![%\\d.,])\\d+(?:[.,]\\d+)?\\s?%(?!\\d)', ornek: 'artış 15% oldu' },
  ]),
  ...desenler('6.12', 'cizgi', 'olasi', [{ desen: UZUN_CIZGI, ornek: `A ${UZUN_CIZGI} B` }]),
  ...desenler('6.13', 'cizgi', 'olasi', [{ desen: ORTA_CIZGI, ornek: `2019${ORTA_CIZGI}2024` }]),
  ...desenler('6.14', 'turkce', 'zayif', [
    { desen: ',\\s+(?:ama|fakat|ve|veya|ya da)(?![\\p{L}\\p{N}])', ornek: 'anlamlı, ama küçüktür' },
  ]),
  ...desenler('6.26', 'turkce', 'olasi', [
    {
      desen: PLURAL.replace('KELIMELER', 'birçok|pek çok|çeşitli|iki|üç|dört|beş|yedi|sekiz|dokuz|\\d+'),
      ornek: 'Birçok çalışmalarda üç farklı yöntemler denenmiştir',
    },
  ]),
  ...desenler('6.26', 'turkce', 'zayif', [
    { desen: PLURAL.replace('KELIMELER', 'bazı|her'), ornek: 'bazı çalışmalarda' },
  ]),
  ...desenler('6.28', 'turkce', 'zayif', [
    { desen: "\\d+['’]?(?:uncu|üncü|ıncı|inci)\\s+madde\\p{L}*", ornek: "49'uncu Maddesi'ne" },
  ]),

  // Section 7: format traces
  ...desenler('7.10', 'bicim', 'kesin', [
    { desen: '<!--[\\s\\S]*?-->', ornek: '<!-- gizli yorum -->' },
    { desen: '\\u21a9\\ufe0f?', ornek: '↩' },
    { desen: '\\[\\^[\\p{L}\\p{N}]+\\]', ornek: '[^1]' },
  ]),
  ...desenler('7.6', 'bicim', 'kesin', [
    { desen: '^#{1,6}[ \\t]+\\S', ornek: '## Başlık' },
    { desen: '\\*\\*[^*\\n]{1,80}\\*\\*', ornek: '**kalın**' },
    { desen: '^[ \\t]*[-*_]{3,}[ \\t]*$', ornek: '---' },
    { desen: '```', ornek: '```js' },
  ]),
  ...desenler('7.1', 'bicim', 'olasi', [{ desen: '^[ \\t]*[-*\\u2022\\u00b7][ \\t]+\\S', ornek: '- madde' }]),
  ...grup('7.1', 'bicim', 'zayif', [
    { terim: 'Birincisi', cumleBasi: true },
    { terim: 'İkincisi', cumleBasi: true },
    { terim: 'Üçüncüsü', cumleBasi: true },
  ]),
  ...desenler('7.4', 'bicim', 'olasi', [
    {
      desen:
        '(?:(?![\\u00a9\\u00ae\\u2122])\\p{Extended_Pictographic}|[\\u2190-\\u21ff\\u2713\\u2714\\u2705\\u274c])',
      ornek: '✅',
    },
  ]),
  ...desenler('7.11', 'bicim', 'olasi', [
    {
      desen: '^[ \\t]*(?:değişiklik özeti|yapılan düzeltmeler|yapılan değişiklikler)(?![\\p{L}\\p{N}])',
      ornek: 'Değişiklik özeti',
    },
  ]),
];

/** Sentence beginnings with a comma after the opening conjunction (6.14) are handled per sentence. */
export const CUMLE_BASI_BAGLACLARI = [
  'ancak',
  'dolayısıyla',
  'bununla birlikte',
  'ayrıca',
  'öte yandan',
  'fakat',
  'ama',
  'bunun yanı sıra',
] as const;

/** "Bir ... olarak" opening, the calque of English "As a ..." (6.25). */
export const BIR_OLARAK_DESEN = "^(?:[\\p{L}'’]+\\s+){0,1}bir\\s+(?:[\\p{L}'’]+\\s+){0,2}olarak(?=[\\s,])";

/** Connectors counted for the repetition table (10.4) and watched as paragraph openers (4.6). */
export const BAGLAC_LISTESI = [
  'bu nedenle',
  'dolayısıyla',
  'ayrıca',
  'öte yandan',
  'bunun yanı sıra',
  'sonuç olarak',
  'bununla birlikte',
  'bu bağlamda',
  'bu çerçevede',
  'bu doğrultuda',
  'bu noktada',
  'ancak',
  'üstelik',
  'nitekim',
  'özetle',
] as const;

/** Light verbs counted next to the connectors (10.4). */
export const KALIP_FIILLER = [
  { etiket: 'gerçekleştir-', desen: 'gerçekleştir\\p{L}*' },
  { etiket: 'sağla-', desen: 'sağla(?:ma|mak|mış|r|y|n|dı|nı)\\p{L}*' },
  { etiket: 'katkıda bulun-', desen: 'katkıda bulun\\p{L}*' },
  { etiket: 'yardımcı ol-', desen: 'yardımcı ol\\p{L}*' },
  { etiket: 'sahip ol-', desen: 'sahip ol\\p{L}*' },
] as const;

/** The four labels for the same person that rule 4.9 names. */
export const KATILIMCI_TERIMLERI = ['katılımcı', 'denek', 'birey', 'yanıtlayıcı'] as const;
