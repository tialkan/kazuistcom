# Kişisel veri işleme envanteri

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-10-19 (taslak 1).

Bu envanter `packages/db/src/schema` (contracts-v1) tablolarından ve `packages/contracts/openapi.yaml`
uçlarından türetildi; şablondan değil. Kimlik, odeme ve yz-gecidi ajanlarının Dalga 1 uygulaması
bitince satır satır yeniden doğrulanır. Bu belge uyum garantisi vermez.

Veri sorumlusu: Kulular Bilişim Teknolojileri Ltd. Şti. MERSİS 0591095454600001, Ankara Ticaret Sicili 550123,
Kızılırmak Mah. 1450 Sk. Hayat Plaza No: 16 Çankaya / Ankara (onay 2026-10-20, docs/kararlar.md). KEP: [YER TUTUCU, Tarık'tan].

## Kaynaklar

- 6698 sayılı Kanun (RG 7/4/2016, 29677), güncel metin mevzuat.gov.tr'den okundu (2026-10-19):
  m.5/2 bentleri (a) ilâ (f), m.9 (7499 sayılı Kanunla değişik, 2/3/2024), m.10 (a) ilâ (d), m.11 (a) ilâ (ğ),
  m.13/2 (otuz gün), m.16 sicil.
- Saklama süreleri için kanuni dayanaklar ayrı ayrı "[DOĞRULANACAK]" işaretlidir; mali müşavir ve Tarık teyidi gerekir.

## Hukuki sebep kısaltmaları

| Kod | Dayanak |
|---|---|
| 5/2-c | Sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması |
| 5/2-ç | Veri sorumlusunun hukuki yükümlülüğü |
| 5/2-e | Bir hakkın tesisi, kullanılması veya korunması |
| 5/2-f | Meşru menfaat (denge testi: `denge-testi.md`) |
| 5/1 | Açık rıza |

## Envanter

| # | Veri kategorisi | Alanlar (tablo.sütun) | Amaç | Hukuki sebep | Saklama süresi | Alıcı |
|---|---|---|---|---|---|---|
| 1 | Kimlik ve iletişim | users.email, users.name, users.image, users.email_verified | Hesap açma, giriş, hizmet bildirimleri | 5/2-c | Hesap süresince; silme talebinden 14 gün sonra kalıcı silme (varsayılan karar; account.purge, ADR-0023) | Barındırma (Türkiye), e-posta gönderim sağlayıcısı (bkz. aktarim.md) |
| 2 | Kimlik doğrulama | accounts (provider_id, account_id, access_token, refresh_token, id_token, password özeti), passkeys (public_key, credential_id, device_type, aaguid), verifications | Giriş güvenliği; Google ve Apple ile giriş | 5/2-c | Hesap süresince; verifications expires_at ile | Google, Apple (kullanıcı kendi seçerse, oturum açma sırasında) |
| 3 | İşlem güvenliği | sessions.ip_address, sessions.user_agent, sessions.expires_at | Oturum yönetimi, kötüye kullanımı önleme, hız sınırı | 5/2-f ve 5/2-ç | [DOĞRULANACAK: oturum bitiminden sonra süre; 5651 sayılı Kanun kapsamı ve trafik bilgisi süresi teyit edilecek] | Barındırma (Türkiye) |
| 4 | Eğitim bilgisi | edu_verifications.email, code_hash, verified_at; profiles.edu_verified | edu.tr doğrulamasıyla öğrenci hakkı | 5/2-c | Doğrulama yıllık yenilenir; kod expires_at ile | Yok |
| 5 | Profil ve tercih | profiles.target_profession, avatar, tone, plan; notification_prefs | Kişiselleştirme, bildirim tercihi | 5/2-c | Hesap süresince | Yok |
| 6 | Pazarlama izni | consents (kind=acik_riza_pazarlama) | Kampanya e-postası | 5/1 ve İYS kaydı | Rıza geri alınana kadar; kanıt kaydı için [DOĞRULANACAK: 6563 ve Ticari İletişim Yönetmeliği saklama süresi] | İYS |
| 7 | Rıza ve onay kanıtı | consents (user_hash, kind, version, granted, context, created_at); orders.consent_versions | Onayın ispatı (Mesafeli Sözleşmeler Yön. m.5 ispat yükü satıcıda) | 5/2-ç ve 5/2-e | Ekle-yalnız; hesap silinince user_id NULL, user_hash kalır. [DOĞRULANACAK: zamanaşımı süresine göre üst sınır] | Yok |
| 8 | Müşteri işlem | orders, payments (provider_payment_id, amount_kurus, status, raw), subscriptions, refund_requests, coupons kullanımı | Satış, abonelik, iade | 5/2-c, 5/2-ç | [DOĞRULANACAK: VUK ve TTK saklama süreleri, mali müşavirle] | iyzico (Türkiye), e-Arşiv entegratörü, mali müşavir |
| 9 | Finans (fatura) | invoices (number, total_kurus, pdf_object_key) | Fatura düzenleme | 5/2-ç | [DOĞRULANACAK: VUK saklama süresi] | e-Arşiv entegratörü, Gelir İdaresi |
| 10 | Kart verisi | Kazuist'te tutulmaz (plan 9.2/4) | | | | iyzico doğrudan toplar |
| 11 | Uygulama içi satın alma | iap_transactions (transaction_id, original_transaction_id, product_id, signed_payload) | iOS kredi ve abonelik | 5/2-c | Satış kayıtlarıyla aynı | Apple (kullanıcı ile Apple ilişkisi) |
| 12 | Cüzdan ve defter | wallets, credit_lots, ledger_entries, ledger_transactions, reservations | Kredi bakiyesi | 5/2-c, 5/2-ç | Değiştirilemez defter; [DOĞRULANACAK: mali kayıt süresi] | Yok |
| 13 | Kullanıcı içeriği (kitaplık) | library_items.note, guide_progress | Kaydettiklerim, rehber ilerlemesi | 5/2-c | Hesap süresince | Yok |
| 14 | Kullanıcı içeriği (yazma) | writing_projects (title, deadline, kelime sayıları), writing_logs.note, reminders, template_rules.source_object_key (yüklenen kılavuz) | Yazma takibi, kılavuzdan şablon | 5/2-c | Hesap süresince; yükleme silinince nesne de silinir [DOĞRULANACAK: yazma ajanından] | Platform modunda maskeli metin OpenRouter üzerinden YZ modeline (aktarim.md) |
| 15 | Pratik | card_reviews, exam_attempts (answers, score, by_subject) | Aralıklı tekrar, deneme sonucu | 5/2-c | Hesap süresince | Yok |
| 16 | Kampüs profili ve paylaşım | kampus.profiles (display_name, institution, bio), kampus.posts, kampus.files, kampus.follows, kampus.fulltext_requests.message, kampus.summaries, kampus.posters | Akademik paylaşım | 5/2-c; kullanıcının açık paylaşımı için ayrıca 5/2-d değerlendirilir | Hesap süresince veya kullanıcı silene kadar | Diğer kullanıcılar (paylaşım ayarına göre); YZ özeti için maskeli metin |
| 17 | Şikâyet | kampus.reports (reporter_id, target, reason) | Topluluk kurallarının uygulanması | 5/2-f, 5/2-e | [DOĞRULANACAK: karar sonrası süre] | Yönetim ekibi |
| 18 | Kaldırma talebi | takedown_requests (reason, contact_email, record_id) | Telif ve kişisel veri kaldırma | 5/2-ç (m.13), 5/2-e | [DOĞRULANACAK] | Yönetim ekibi |
| 19 | KVKK başvurusu | POST /v1/kvkk-requests (kind, detail); şemada tablo yok (istek: docs/istekler/hukuk-uyum-kvkk-basvuru.md) | m.11 haklarının kullanımı | 5/2-ç | [DOĞRULANACAK] | Yok |
| 20 | Bildirim cihazı | push_subscriptions (endpoint, keys, channel) | Web Push ve APNs | 5/2-c | Abonelik iptaline kadar | Tarayıcı itme hizmeti, Apple APNs |
| 21 | Denetim kaydı | audit_log (actor_hash, action, subject, diff) | Güvenlik, hesap verebilirlik | 5/2-f, 5/2-ç | Ekle-yalnız; [DOĞRULANACAK] | Yok |
| 22 | YZ kullanım meta verisi | provider_costs (gün, model, token; kişiye bağlı değil); log: kullanıcı kimliği özeti (plan 8.8) | Maliyet ve kötüye kullanım | 5/2-f | [DOĞRULANACAK] | Yok |
| 23 | Corpus içindeki üçüncü kişi verileri | records.text, chunks.text, anonymization_spans (maskelenmiş varlıklar), sources_raw (ham arşiv) | Yargı kararlarına akademik erişim | 5/2-f (denge-testi.md) ve m.4/2 | Ham arşiv: [DOĞRULANACAK: süre, veri-toplama ajanından]; anonim metin süresiz | Yayın yalnız anonim metinle |
| 24 | Analitik | Umami, yalnız açık rıza ile; kişisel veri tutulmaz (plan 13.2/10) | Ürün ölçümü | 5/1 (çerez) | [DOĞRULANACAK: Umami saklama ayarı, altyapı ajanından] | Kendi sunucumuz |
| 25 | Hata izleme | GlitchTip (kendi sunucumuz) | Hata ayıklama | 5/2-f | [DOĞRULANACAK] | Yok |

## Özel nitelikli veri

Kullanıcıdan özel nitelikli veri istenmez. Corpus metinlerinde geçen m.6 verisi Ek E sıkı moduyla
genelleştirilir veya maskelenir. Kampüs dosyası ve yazma yüklemesi kullanıcının kendi içeriğidir;
topluluk kuralları özel nitelikli veri paylaşımını yasaklar.

## Açık noktalar

1. Saklama süreleri tablosu (imha politikası) yazılmalı; VERBİS kaydı gerekirse zorunludur (yukumlulukler.md).
2. Silme akışında users.deleted_at sonrası kalıcı silme işi şemada tanımlı değil (istek dosyası).
3. accounts tablosunda OAuth access_token ve refresh_token saklanması, yalnız giriş için gerekmiyorsa
   azaltılmalı (veri minimizasyonu, m.4/2-ç); kimlik ajanına soru.
