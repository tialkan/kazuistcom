# Sağlayıcı doğrulama notu (19 Ekim 2026)

Bağdaştırıcıların dayandığı bilgiler; her biri resmî belgeden okundu.

| Sağlayıcı | Uç ve akış | Kimlik doğrulama | Tarayıcı (CORS) | Kaynak |
|---|---|---|---|---|
| Anthropic | `POST https://api.anthropic.com/v1/messages`, `stream: true`; SSE olayları `message_start`, `content_block_delta` (`text_delta`), `message_delta` (çıktı tokeni), `message_stop` | `x-api-key`, `anthropic-version: 2023-06-01` | Destekleniyor; istekte `anthropic-dangerous-direct-browser-access: true` başlığı gerekiyor | https://platform.claude.com/docs/en/build-with-claude/streaming |
| OpenRouter | `POST https://openrouter.ai/api/v1/chat/completions`, OpenAI uyumlu SSE, `[DONE]` sonu | `Authorization: Bearer` | Destekleniyor (Anlatsın tarayıcı akışında kullanılıyor) | https://openrouter.ai/docs/guides/routing/provider-selection |
| OpenAI | `POST https://api.openai.com/v1/chat/completions`, `stream_options.include_usage` ile son parçada kullanım | `Authorization: Bearer` | API CORS yanıtı veriyor; resmî SDK tarayıcıda `dangerouslyAllowBrowser` ister. BYOK istemci modunda kabul edilebilir, aksi halde aktarma | https://platform.openai.com/docs/api-reference/chat |
| Gemini | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`; her parça bir `GenerateContentResponse`; `systemInstruction`, `contents`, `generationConfig.maxOutputTokens` | `x-goog-api-key` başlığı (anahtar URL'ye konmaz) | Destekleniyor | https://ai.google.dev/api/generate-content |

## Model kimlikleri

Resmî liste (https://platform.claude.com/docs/en/about-claude/models/overview): Claude Haiku 5.5 `claude-haiku-5-5` (girdi 0,10 USD'den, çıktı 0,50 USD'den başlayan fiyat, milyon token), Claude Sonnet 5.5 `claude-sonnet-5-5` (2 USD / 10 USD). OpenRouter (ADR-0025 ile platformun birincil sağlayıcısı) kimlikleri https://openrouter.ai/api/v1/models listesinden 23 Ekim 2026'da doğrulandı: `anthropic/claude-haiku-5.5` ve `anthropic/claude-sonnet-5.5`. Platform isteklerinde `provider.data_collection: "deny"` ve `provider.zdr: true` zorunludur.

## OpenRouter gizlilik

`provider.data_collection` değerleri `allow` (varsayılan) ve `deny`; `provider.zdr: true` yalnız sıfır veri saklama uçlarına yönlendirir. Geçit her istekte `deny` gönderir. Platform modunda `zdr: true` her istekte zorunludur (ADR-0025); BYOK'ta yalnız "gizlilik öncelikli" seçeneğinde eklenir.

## Gemini BYOK

docs/kararlar.md (22 Ekim 2026): Gemini anahtarı yalnız kullanıcı ücretli faturalandırmayı beyan ederse kabul edilir; beyan yoksa Gemini BYOK her işlem için kapalıdır (plan 8.4 daraltıldı).

## BYOK istemci denetimi (15 Kasım 2026)

- OpenRouter CORS: `OPTIONS https://openrouter.ai/api/v1/chat/completions` (genel bir `Origin` ile) 204 döndü;
  `Access-Control-Allow-Origin: *`, izinli başlıklar arasında `Authorization`, `Content-Type`, `HTTP-Referer`,
  `X-Title` ve `X-OpenRouter-Title` var. `GET https://openrouter.ai/api/v1/key` anahtarsız 401 döndü, ön uçuşu
  `GET` için aynı izinleri veriyor. Tarayıcıdan doğrudan çağrı bu yüzden çalışır; e2e (`tests/e2e/specs/byok.spec.ts`)
  bunu gerçek CSP altında taklit sağlayıcıyla sınar.
- Kimlik doğrulama: `Authorization: Bearer <anahtar>` (https://openrouter.ai/docs/api/reference/authentication).
  Aynı sayfa, harcama sınırı olmayan anahtarın istemci koduna konmamasını öneriyor; arayüz "Anahtarı dene" ile
  `data.limit` boşsa bunu söyler.
- `GET /api/v1/key` yanıtında `data.is_free_tier` ve `data.limit` var
  (https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key). Ücretsiz katman uyarısı (FR-84)
  bu alana dayanır; yanıtın geri kalanı okunmaz, saklanmaz.
- `provider.data_collection` (`allow` varsayılan, `deny`) ve `provider.zdr` (yalnız `true` iken etkili) istek
  gövdesindeki `provider` nesnesinin alanları (https://openrouter.ai/docs/guides/routing/provider-selection).
- Akıl yürütme tokenleri `max_tokens` bütçesinden düşer; `reasoning.effort` değerleri `max`, `xhigh`, `high`,
  `medium`, `low`, `minimal`, `none`; zorunlu akıl yürütmeli model `none`'u reddeder
  (https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).
- Önerilen BYOK modelleri `https://openrouter.ai/api/v1/models` listesinden: `anthropic/claude-haiku-5.5`
  (akıl yürütme isteğe bağlı, parametre gönderilmez), `openai/gpt-5.6-luna` (varsayılan açık, `effort: none`
  gönderilir), `google/gemini-3.8-flash` (zorunlu, en düşük `effort: low` gönderilir). Listedeki `:free` sonlu
  modeller için arayüz ücretsiz model uyarısı gösterir.
- Dikkat: `anthropic/claude-sonnet-5.5` için `reasoning.mandatory: true`, varsayılan `high`. Platformdaki derin
  özet (1.200 çıktı tokeni) bu yüzden çıktı bütçesinin çoğunu akıl yürütmeye harcayabilir; derin özet yalnız
  krediyle açıldığı ve ödeme kapalı yayında kullanılmadığı için bu PR'da değiştirilmedi.

## Doğrulanamayanlar

- Anthropic CORS başlığının güncel belgedeki yeri bu çalışmada yalnız ikincil kaynakla teyit edildi; gerçek duman testi anahtar dosyası olmadığı için çalışmadı.
- OpenAI tarayıcı CORS davranışı resmî belgede açıkça yazılı değil; tarayıcıdan ilk kurulumda denenmeli, başarısızsa `browserCallSupport.openai` false yapılır.
- 15 Kasım 2026: OpenRouter'a gerçek anahtarla canlı BYOK çağrısı yapılmadı (`~/Desktop/` altında OpenRouter anahtar dosyası yok). `reasoning.effort` değerlerinin GPT-5.6 Luna ve Gemini 3.8 Flash'ta beklenen bütçeyi bıraktığı canlıda denenmeli.
