# Sağlayıcı doğrulama notu (19 Ekim 2026)

Bağdaştırıcıların dayandığı bilgiler; her biri resmî belgeden okundu.

| Sağlayıcı | Uç ve akış | Kimlik doğrulama | Tarayıcı (CORS) | Kaynak |
|---|---|---|---|---|
| Anthropic | `POST https://api.anthropic.com/v1/messages`, `stream: true`; SSE olayları `message_start`, `content_block_delta` (`text_delta`), `message_delta` (çıktı tokeni), `message_stop` | `x-api-key`, `anthropic-version: 2023-06-01` | Destekleniyor; istekte `anthropic-dangerous-direct-browser-access: true` başlığı gerekiyor | https://platform.claude.com/docs/en/build-with-claude/streaming |
| OpenRouter | `POST https://openrouter.ai/api/v1/chat/completions`, OpenAI uyumlu SSE, `[DONE]` sonu | `Authorization: Bearer` | Destekleniyor (Anlatsın tarayıcı akışında kullanılıyor) | https://openrouter.ai/docs/guides/routing/provider-selection |
| OpenAI | `POST https://api.openai.com/v1/chat/completions`, `stream_options.include_usage` ile son parçada kullanım | `Authorization: Bearer` | API CORS yanıtı veriyor; resmî SDK tarayıcıda `dangerouslyAllowBrowser` ister. BYOK istemci modunda kabul edilebilir, aksi halde aktarma | https://platform.openai.com/docs/api-reference/chat |
| Gemini | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`; her parça bir `GenerateContentResponse`; `systemInstruction`, `contents`, `generationConfig.maxOutputTokens` | `x-goog-api-key` başlığı (anahtar URL'ye konmaz) | Destekleniyor | https://ai.google.dev/api/generate-content |

## Model kimlikleri

Resmî liste (https://platform.claude.com/docs/en/about-claude/models/overview): Claude Haiku 5.5 `claude-haiku-5-5` (girdi 0,10 USD'den, çıktı 0,50 USD'den başlayan fiyat, milyon token), Claude Sonnet 5.5 `claude-sonnet-5-5` (2 USD / 10 USD). OpenRouter yedeğinde `anthropic/claude-haiku-5.5` biçimi varsayıldı; OpenRouter model listesinden ayrıca doğrulanmalı.

## OpenRouter gizlilik

`provider.data_collection` değerleri `allow` (varsayılan) ve `deny`; `provider.zdr: true` yalnız sıfır veri saklama uçlarına yönlendirir. Geçit her istekte `deny` gönderir; `zdr` yalnız "gizlilik öncelikli" seçeneğinde eklenir.

## Doğrulanamayanlar

- Anthropic CORS başlığının güncel belgedeki yeri bu çalışmada yalnız ikincil kaynakla teyit edildi; gerçek duman testi anahtar dosyası olmadığı için çalışmadı.
- OpenAI tarayıcı CORS davranışı resmî belgede açıkça yazılı değil; tarayıcıdan ilk kurulumda denenmeli, başarısızsa `browserCallSupport.openai` false yapılır.
