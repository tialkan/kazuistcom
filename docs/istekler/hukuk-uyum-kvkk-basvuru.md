# İstek: KVKK başvuru kaydı ve hesapsız başvuru

1. İsteyen: hukuk-uyum, dal dalga-1/hukuk-uyum/metinler.
2. Gerekçe: plan 10.10 ve 11 (KVKK başvuru formu /hesap/kvkk ve /hukuki/basvuru); KVKK m.11 ve m.13/2 (otuz gün,
   cevabın yazılı veya elektronik bildirimi). Sözleşmede POST /v1/kvkk-requests var, fakat:
   - packages/db şemasında başvuruyu ve süresini tutan tablo yok; otuz günlük süre izlenemiyor.
   - Uç oturum istiyor (401); /hukuki/basvuru hesapsız kişiler için (karar metninde adı geçen kişi) yol göstermiyor.
   - kind enum'u (bilgi, duzeltme, silme, itiraz, aktarim_bilgisi) m.11'in dokuz hakkını karşılamıyor:
     islenip_islenmedigi, amac, ucuncu_kisilere_bildirim, otomatik_analiz_itirazi, zarar_giderimi eksik.
3. Önerilen değişiklik:
   - Tablo kvkk_requests: id, user_id (null olabilir), requester_name, identity_ref (şifreli veya özet),
     address, contact_email, relation, kind, detail, reply_channel, status, received_at, due_at (received_at + 30 gün),
     decided_at, decided_by, response_summary.
   - kind enum'unun genişletilmesi (yukarıdaki değerler).
   - Hesapsız başvuru için ayrı uç veya mevcut ucun security: [] ile hız sınırlı ve e-posta doğrulamalı açılması.
4. Geriye uyumluluk: Enum genişletme ve yeni tablo yıkıcı değil.
5. Aciliyet: Yayın kapısından önce gerekli; başvuru formu metni hazır (content/hukuki/tr/basvuru.md).
   Kimlik bilgisi (T.C. kimlik numarası) alanının Tebliğ'e göre zorunlu olup olmadığı [DOĞRULANACAK].
