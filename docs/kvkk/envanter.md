# Kişisel veri işleme envanteri

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-11-12 (taslak 2, review.md P5). Uyum garantisi vermez.

Bu envanter `packages/db/src/schema` tablolarından, `packages/ai-gateway`, `packages/ledger` ve `apps/web` içindeki
gerçek veri akışından türetildi (kimlik, odeme ve yz-gecidi yolları 12 Kasım 2026 `main` üzerinde okundu); şablondan
değildir. Turkuaz Kampüs satırları ADR-0031 ile çıkarıldı; Kampüs tabloları şemada durur ama hiçbir yol onlara yazmaz
(silinmeleri mimar planında: docs/istekler/mimar-p1-sozlesme-temizligi.md).

Veri sorumlusu: Kulular Bilişim Teknolojileri Ltd. Şti. MERSİS 0591095454600001, Ankara Ticaret Sicili 550123,
Kızılırmak Mah. 1450 Sk. Hayat Plaza No: 16 Çankaya / Ankara (onay 2026-10-20, docs/kararlar.md). KEP: [YER TUTUCU, Tarık'tan].

## Kaynaklar

- 6698 sayılı Kanun (RG 7/4/2016, 29677), güncel metin mevzuat.gov.tr PDF'inden 12 Kasım 2026'da okundu: m.5/2 (a)
  ilâ (f), m.6 (7499 sayılı Kanunla değişik), m.9 (7499 sayılı Kanunla değişik, 2/3/2024), m.10 (a) ilâ (d), m.11 (a)
  ilâ (ğ), m.13/2, m.14/1, m.16/2.
- Saklama süreleri: 6102 sayılı TTK m.82/5-6 (on yıl, takvim yılı sonundan) ve 213 sayılı VUK m.253 (beş yıl, izleyen
  takvim yılından), ikisi de mevzuat.gov.tr PDF'inden 12 Kasım 2026'da okundu; Mesafeli Sözleşmeler Yönetmeliği
  m.20/1 (üç yıl, 2 Kasım doğrulaması); Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik m.13/2
  (üç yıl; RG 4/1/2020, 30998 değişikliği, Resmî Gazete sayfa görüntüsünden okundu). Hangi kaydın ticari defter
  dayanağı sayılacağı mali müşavirle teyit edilir.

## Hukuki sebep kısaltmaları

| Kod | Dayanak |
|---|---|
| 5/2-c | Sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması |
| 5/2-ç | Veri sorumlusunun hukuki yükümlülüğü |
| 5/2-e | Bir hakkın tesisi, kullanılması veya korunması |
| 5/2-f | Meşru menfaat (denge testi: `denge-testi.md`) |
| 5/1 | Açık rıza |

## Envanter

Konum sütunu: "Hetzner" Hetzner Online GmbH'nin AB içindeki veri merkezi demektir (ADR-0030, ADR-0033); bu bir yurt
dışı aktarımdır ve dayanağı `aktarim.md`'dedir. Önerilen saklama süreleri imha politikası taslağıdır; Tarık onayıyla
kesinleşir, ardından mimar `retention.sweep` iş türünü ekler.

| # | Veri kategorisi | Alanlar (tablo.sütun veya yer) | Amaç | Hukuki sebep | Önerilen saklama | Konum ve alıcı |
|---|---|---|---|---|---|---|
| 1 | Kimlik ve iletişim | users.email, users.name, users.image, users.email_verified | Hesap, giriş, hizmet bildirimi; satın almada ad soyad zorunlu (odeme/page.tsx en az iki parça) | 5/2-c | Hesap süresince; silme talebinden 14 gün sonra kalıcı silme (account.purge, ACCOUNT_PURGE_GRACE_DAYS) | Hetzner; e-posta sağlayıcısı |
| 2 | Kimlik doğrulama | accounts (provider_id, account_id, password özeti, access_token, refresh_token, id_token), passkeys (public_key, credential_id, aaguid), two_factors (secret, backup_codes; Better Auth ile şifreli), verifications | Giriş güvenliği; Google ve Apple ile giriş; yönetici için TOTP | 5/2-c | Hesap süresince; verifications expires_at ile | Hetzner; Google, Apple (kullanıcı seçerse) |
| 3 | İşlem güvenliği | sessions.ip_address, user_agent, auth_method, expires_at | Oturum yönetimi, kötüye kullanımın önlenmesi | 5/2-f, 5/2-ç | Oturum bitiminden sonra en çok 6 ay (öneri) [DOĞRULANACAK: 5651 sayılı Kanun kapsamında Kazuist'in yer sağlayıcı sayılıp sayılmadığı ve trafik bilgisi süresi] | Hetzner |
| 4 | Ücretsiz hak sayaçları | Valkey anahtarları `free:ip:<IP özeti>:<gün>`, `credits:user:<hesap özeti>:<gün>`; özet anahtarlı SHA-256'nın ilk 24 karakteri (gecit.ts `keyedHash`) | Günlük ücretsiz özet hakkı, harcama tavanı | 5/2-f | Bir gün (anahtar ömrü) | Hetzner |
| 5 | Eğitim bilgisi | edu_verifications.email, code_hash, attempts, verified_at; profiles.edu_verified | edu.tr doğrulamasıyla öğrenci hakkı | 5/2-c | Yıllık yenileme; kod expires_at ile | Hetzner |
| 6 | Profil ve tercih | profiles.target_profession, avatar, tone, plan; notification_prefs | Kişiselleştirme, bildirim tercihi | 5/2-c | Hesap süresince | Hetzner |
| 7 | Pazarlama izni | consents (kind=acik_riza_pazarlama) | Kampanya e-postası | 5/1 ve İYS kaydı | Rıza geri alınana kadar; kanıt onayın sona ermesinden itibaren üç yıl (Ticari İletiler Yön. m.13/2) | Hetzner; İYS |
| 8 | Rıza ve onay kanıtı | consents (user_hash, kind, version, granted, context, created_at); orders.consent_versions | Onayın ispatı | 5/2-ç, 5/2-e | Ekle-yalnız; hesap silinince user_id NULL, user_hash kalır. Sipariş onayları sipariş kaydıyla aynı süre; diğerleri son işlemden itibaren on yıl (öneri; genel zamanaşımı mali müşavir ve Tarık teyidiyle) | Hetzner |
| 9 | Müşteri işlem | orders, payments (provider_payment_id, amount_kurus, status, raw), subscriptions, refund_requests, refund_request_items, coupon_redemptions, webhook_events.payload, idempotency_keys | Satış, iade, mutabakat | 5/2-c, 5/2-ç | Takvim yılı sonundan itibaren on yıl (TTK m.82); idempotency_keys expires_at ile | Hetzner; iyzico (Türkiye), mali müşavir |
| 10 | Sipariş anı sözleşme metni | order_legal_documents (filled_text içinde ad soyad ve e-posta), order_legal_document_deliveries | Sözleşmenin kalıcı veri saklayıcısıyla verilmesi ve ispatı (ADR-0027) | 5/2-ç, 5/2-e | En az üç yıl (Mesafeli Yön. m.20/1); satış kaydıyla birlikte on yıl önerilir | Hetzner; e-posta sağlayıcısı |
| 11 | Finans (fatura) | invoices (number, total_kurus, pdf_object_key) | Fatura düzenleme | 5/2-ç | Takvim yılı sonundan itibaren on yıl (TTK m.82; VUK m.253 beş yıl) | Hetzner; e-Arşiv entegratörü, Gelir İdaresi |
| 12 | Kart verisi | Kazuist'te tutulmaz (plan 9.2/4) | | | | iyzico doğrudan toplar |
| 13 | Uygulama içi satın alma | iap_transactions (transaction_id, original_transaction_id, product_id, signed_payload) | iOS kredi | 5/2-c | Satış kayıtlarıyla aynı | Hetzner; Apple (kullanıcı ile Apple ilişkisi). iOS uygulaması depoda henüz yok |
| 14 | Cüzdan ve defter | wallets, credit_lots, ledger_entries, ledger_transactions, reservations | Kredi bakiyesi | 5/2-c, 5/2-ç | Değiştirilemez defter; satış kayıtlarıyla aynı | Hetzner |
| 15 | Kullanıcı içeriği (kitaplık) | library_items.note | Kaydettiklerim | 5/2-c | Hesap süresince | Hetzner |
| 16 | Kullanıcı içeriği (yazma) | writing_projects (title, deadline, kelime sayıları), writing_logs.note, reminders; yüklenen kılavuz bellekte okunur, diske yazılmaz (yazma/_cekirdek/metin-cikarma.ts); çıkarılan kurallar ve alıntılar template_rules, template_rule_evidence | Yazma takibi, kılavuzdan şablon | 5/2-c | Hesap süresince | Hetzner; kural çıkarmada maskeli metin OpenRouter üzerinden YZ modeline (yazma/_sunucu/yz.ts) |
| 17 | Kaynaklı özet sorusu | İstek gövdesi; veri tabanına yazılmaz, log yalnız meta veri (ai-gateway/src/observe.ts) | Kaynaklı özet | 5/2-c | İstek süresince | Maskeli metin OpenRouter üzerinden YZ modeline; BYOK istemci modunda kullanıcının sağlayıcısına |
| 18 | YZ kullanım meta verisi | Log satırı: requestId, işlem, mod, sağlayıcı, model, token, süre, maliyet, userHash, sonuç; provider_costs (kişiye bağlı değil) | Maliyet ve kötüye kullanım | 5/2-f | Log saklama süresi altyapıda belirlenir [DOĞRULANACAK: altyapi log döndürme ayarı] | Hetzner |
| 19 | Pratik ve rehber ilerlemesi | Tarayıcı localStorage: kazuist.pratik.v1, kazuist.pratik.deneme.v1, kazuist.rehber.v1. Sunucuya gitmez | Aralıklı tekrar, rehber işaretleri | Veri sorumlusu işlemesi yok (cihazda) | Kullanıcı silene kadar | Yok. card_reviews, exam_attempts, guide_progress tablolarına bugün yazan kod yok |
| 20 | /tespit metni | Yalnız tarayıcı belleği; ağ ve depolama yok (tespit.test.ts) | Yazım izi denetimi | İşleme yok | Sayfa kapanınca | Yok |
| 21 | Kaldırma talebi | takedown_requests (requester_name, reason, rights_info, contact_email, target) | Telif ve kişisel veri kaldırma | 5/2-ç (m.13), 5/2-e | Sonuçlandıktan sonra üç yıl (öneri) | Hetzner; yönetim ekibi |
| 22 | KVKK başvurusu | kvkk_requests (requester_name, nationality, identity_enc şifreli, address, contact_email, phone, detail, response_summary) | m.11 haklarının kullanımı | 5/2-ç | Sonuçlandıktan sonra üç yıl; identity_enc sonuçlanınca silinir (öneri) | Hetzner |
| 23 | Bildirim cihazı | push_subscriptions (endpoint, keys, channel, environment) | Web Push ve APNs | 5/2-c | Abonelik iptaline veya uç geçersizleşene kadar | Hetzner; tarayıcı itme hizmeti, Apple APNs (bildirim metni genel, kişisel veri yok) |
| 24 | Denetim kaydı | audit_log (actor_hash, action, subject, reason, diff) | Güvenlik, hesap verebilirlik | 5/2-f, 5/2-ç | Ekle-yalnız; iki yıl (öneri) | Hetzner |
| 25 | İş kuyruğu | jobs.payload, jobs.result, jobs.error | İşlerin yürütülmesi | 5/2-c | Biten iş 30 gün (öneri; bugün silen kod yok, review.md P1 madde 4) | Hetzner |
| 26 | Corpus içindeki üçüncü kişi verileri | records.text, chunks.text, anonymization_spans, sources_raw (ham arşiv) | Yargı kararlarına akademik erişim | 5/2-f (denge-testi.md) ve m.4/2 | Ham arşiv: yeniden anonimleştirme gerektikçe, en kısa süre [DOĞRULANACAK: veri-toplama ajanından süre]; anonim metin süresiz | Hetzner (T4 kararı açık: K-11 ham metnin Türkiye'de işlenmesini istiyor); yayın yalnız anonim metinle |
| 27 | Analitik | Umami; kodda yok, etkin değil | Ürün ölçümü | 5/1 (etkinleştirilirse) | [DOĞRULANACAK: etkinleştirilirse Umami saklama ayarı] | Kendi sunucumuz |
| 28 | Hata izleme | GlitchTip; kodda SDK yok, etkin değil | Hata ayıklama | 5/2-f | 90 gün (öneri) | Kendi sunucumuz |
| 29 | Yedekler | Veri tabanı ve depo yedekleri | Kesinti ve kayıptan kurtarma | 5/2-f, 5/2-ç | altyapi yedek döngüsü (docs/runbook/yedek.md) | [DOĞRULANACAK: yedek deposu sağlayıcısı ve konumu, review.md T9] |

## Özel nitelikli veri

Kullanıcıdan özel nitelikli veri istenmez. Corpus metinlerinde geçen m.6 verisi Ek E sıkı moduyla
genelleştirilir veya maskelenir. Yazma yüklemesi ve sorgu metni kullanıcının kendi içeriğidir; kullanım koşulları
başkasının özel nitelikli verisini yüklemeyi ve sorguya yazmayı yasaklar.

## Açık noktalar

1. Önerilen saklama sürelerinin Tarık onayı; onaydan sonra mimar `retention.sweep` iş türü (docs/istekler/
   mimar-yonlendirme-hukuk-uyum.md madde 3).
2. accounts tablosunda OAuth access_token ve refresh_token saklanması, yalnız giriş için gerekmiyorsa azaltılmalı
   (veri minimizasyonu, m.4/2-ç); kimlik ajanına önceki istek açık.
3. `packages/db/src/schema/billing.ts` `order_legal_documents` açıklaması "restricted Turkish database" diyor;
   ADR-0033 ile veri tabanı Hetzner'dadır (mimar, istek dosyası).
