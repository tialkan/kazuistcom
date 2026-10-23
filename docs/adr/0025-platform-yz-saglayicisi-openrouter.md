# ADR-0025: Platform modunda YZ sağlayıcısı OpenRouter

Durum: Kabul edildi (Tarık İsmet Alkan, 23 Ekim 2026)

## Bağlam

K-07 ve ADR-0007 platform modunda Claude Haiku 5.5 ve Sonnet 5.5'i öngörüyor ve sağlayıcı olarak Anthropic'i varsayıyordu (plan 8.10, 14.1 `kazuist-anthropic.txt`). Tarık, YZ API'si olarak genellikle OpenRouter'ı tercih ettiğini bildirdi. packages/ai-gateway dört sağlayıcıyı (Anthropic, OpenRouter, OpenAI, Gemini) aynı arayüzle zaten destekliyor; sRepetition da OpenRouter üzerinden Haiku 5.5 kullanıyor.

## Karar

1. Platform modunun varsayılan sağlayıcısı OpenRouter'dır. Modeller değişmez: Haiku 5.5 ve Sonnet 5.5, OpenRouter model kimlikleriyle (kurulumda OpenRouter model listesinden doğrulanır).
2. Her platform isteğinde `provider.data_collection: "deny"` ve `provider.zdr: true` gönderilir; yalnız sıfır veri saklama sunan uç sağlayıcılar kullanılır.
3. Anthropic doğrudan bağdaştırıcısı yedek olarak kodda kalır; anahtar dosyası (`kazuist-anthropic.txt`) zorunlu değildir.
4. Dışarıya yalnız anonim ve maskeli metin gider (K-03, K-11 değişmez).
5. Anahtar dosyası: `~/Desktop/kazuist-openrouter.txt`, satır `OPENROUTER_API_KEY=...`; OpenRouter hesabında aylık harcama limiti ve anahtar başına kredi limiti tanımlanır.

## Gerekçe

Tek hesapla birden çok model, yedek sağlayıcıya geçişin aynı anahtarla yapılabilmesi, ekibin mevcut deneyimi. ZDR ve veri toplama yasağı OpenRouter yönlendirmesinde istek düzeyinde zorlanabiliyor.

## Sonuçlar

- Aktarım envanterine (docs/kvkk/aktarim.md) OpenRouter ara işleyen olarak eklenir; kişisel veri gönderilmediği için ilke değişmez.
- Model maliyeti tablosu (plan 4.4) OpenRouter fiyatıyla yeniden doğrulanır; OpenRouter ücreti eklenir.
- plan.md 8.10 ve 14.1 bu ADR'ye göre okunur.
