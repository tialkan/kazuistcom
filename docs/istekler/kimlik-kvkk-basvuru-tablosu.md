# İstek: KVKK başvuruları, hesap silme ve veri indirme

1. İsteyen: kimlik, dal `dalga-1/kimlik/better-auth`.
2. Gerekçe: plan 10.10 ve FR-104; KVKK m.11 başvurusu, m.7 silme, veri indirme (JSON ve CSV).
3. Önerilen değişiklikler:
   - Tablo `kvkk_requests (id uuid pk, user_id uuid fk users on delete set null, user_hash text not null, kind text not null, detail text not null, status text not null default 'alindi', answered_at timestamptz, created_at)`. Kanuni 30 günlük cevap süresi için `due_at` sütunu önerilir.
   - İş türleri: `account.purge` (silinen hesabın bekleme süresi sonunda kalıcı silinmesi) ve `account.export` (büyük dışa aktarım). `JobType` enum'u ve openapi `JobType`.
   - Sözleşme: `GET /v1/me/export` bugün 202 JobRef diyor; uygulama `?format=json|csv` ile 200 ve dosya dönüyor. Öneri: 200 yanıtını (application/json ve text/csv) eklemek, `format` sorgu parametresini tanımlamak; büyük dışa aktarım için 202 kalabilir.
   - `DELETE /v1/me` 202 JobRef: `account.purge` gelene kadar `jobId` olarak denetim kaydı kimliği dönüyor.
   - `POST /v1/me/edu-verification` ve yönetici ikinci adım başlatma 202 JobRef: gönderim eşzamanlı olduğu için `jobId` rastgele uuid; öneri 202 gövdesiz veya `{ sent: true }`.
4. Geriye uyumluluk: ekleme; yıkıcı değil.
5. Aciliyet: orta. Geçici: KVKK başvurusu `audit_log` satırı (subject_type `kvkk_request`, reason alanında metin) olarak tutuluyor; silme `users.deleted_at` ve oturumların sonlandırılması ile yapılıyor, kalıcı silme bekliyor.

## Sonuç (mimar, 2026-10-20, dal dalga-1/mimar/istekler)

Değiştirerek kabul. `kvkk_requests` hukuk-uyum isteğiyle birleşik tasarlandı (`requester_hash`, `due_at`
dahil). `account.purge` kabul (payload `{ userId }`; DELETE /v1/me bu işin kimliğini döner; bekleme önerisi 14
gün, üst sınır 30 gün, Tarık kararı). `account.export` ret: `GET /v1/me/export` uygulamanın davranışına
çekildi (`?format=json|csv`, 200, `MeExport`). `POST /v1/me/edu-verification` 204 döner. Yönetici ikinci adım
başlatma ucu sözleşme dışında (Better Auth yolu); 204 önerilir.

Sözleşme v1.1; ADR'ler Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md.
