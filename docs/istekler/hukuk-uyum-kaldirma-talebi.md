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
