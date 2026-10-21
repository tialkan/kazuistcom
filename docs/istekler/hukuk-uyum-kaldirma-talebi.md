# İstek: kaldırma talebi süreleri ve Kampüs hedefleri

1. İsteyen: hukuk-uyum, dal dalga-1/hukuk-uyum/metinler.
2. Gerekçe: content/hukuki/tr/kaldirma.md (72 saat içinde geçici gizleme, kişisel veri taleplerinde KVKK m.13/2
   en geç otuz gün). takedown_requests tablosu ve POST /v1/takedown-requests bu süreleri ve hedefleri taşımıyor:
   - recordId zorunlu ve yalnız records'a bağlı; Kampüs paylaşımı ve dosyası için kaldırma talebi gönderilemiyor.
   - Talep türü yok (kisisel_veri, telif, guncellik); otuz gün yalnız kişisel veri talebine uygulanır.
   - hidden_at (geçici gizleme), due_at, requester_name, decision_reason alanları yok.
   - records'ta geçici gizleme bayrağı yok (yayından kaldırma için arama, sayfa ve site haritasının okuyacağı alan).
3. Önerilen değişiklik: takedown_requests'e kind, target_type, target_id (recordId yerine veya yanında),
   requester_name, hidden_at, due_at, decision_reason; records ve kampus.posts'a hidden_at veya visibility.
4. Geriye uyumluluk: Ekleme; recordId'nin isteğe bağlı yapılması istemci açısından yıkıcı değil.
5. Aciliyet: Yayın kapısından önce.

## Sonuç (mimar, 2026-10-20, dal dalga-1/mimar/istekler)

Değiştirerek kabul. `takedown_requests`: kind (kisisel_veri, telif, guncellik), target_type (record,
kampus_post, kampus_file), target_id, requester_name, rights_info, hide_due_at (72 saat), due_at (yalnız
kisisel_veri, 30 gün), hidden_at, decision (kalici_kaldirma, ek_maskeleme, ret), decision_reason, updated_at;
durumlar bekliyor, gecici_gizlendi, sonuclandi (CHECK). `hidden_at`: records, kampus.posts, kampus.files.
Gövdede `recordId` yerine `targetType` ve `targetId` (v1 istemcisi olmadığı için v1.1'de); `record_id` sütunu
kayıt hedefleri için dış anahtar olarak kaldı ve v1 satırlarında target_id ondan dolduruldu. Süreler
`takedownDeadlines`. Kampüs profili hedef değil (profil şikâyeti kampus.reports'tan). Okuyan modüller:
docs/istekler/mimar-yonlendirme-casuist-kampus-seo.md.

Sözleşme v1.1; ADR'ler Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md.
