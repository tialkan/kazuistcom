# İstek: kaldırma taleplerinde 72 saatlik gizleme süresi için işçi uyarısı

- İsteyen: kimlik. Dal: `kimlik/on-ele-gecirme-eposta-kuyruklar`. Tarih: 15 Kasım 2026.
- Kime: mimar (sözleşme: iş türü ya da bildirim türü), orkestra (`apps/worker-node/src/handlers.ts` ve `main.ts`
  kaydı). Bağımsız denetim bulgusu 4, FR-108.

## Bugün ne var

- `/hesap/yonetim/kaldirma` (editör ve yönetici, passkey oturumu ve oturumda TOTP onayı) açık kaldırma taleplerini
  listeler. `bekliyor` durumundaki her talepte gizleme kararının son anı ve kalan saat yazılır; 12 saatten az kalan
  ve süresi dolan talepler uyarı biçimindedir, süresi dolanlar listenin başındadır ve sayfanın üstünde sayılır
  (`apps/web/src/server/auth/review-queues.ts` `listTakedownQueue`, `overdueHideCount`, `hideDeadline`).
- Ekran yalnız açıldığında uyarır. Kimse açmazsa süre sessizce dolar.

## İstenen

1. Sözleşmeye ya bir iş türü (`takedown.hide_deadline`, yük `{}`; günde birkaç kez, `once` anahtarı saat dilimi)
   ya da `notify.send` için personel bildirim türü (`kaldirma_suresi`, zorunlu e-posta, ticari değil). Yük yalnız
   sayı ve kimlik taşır; talep metni ve iletişim adresi taşımaz.
2. Orkestra `main.ts`'te saatlik bir tik: `takedown_requests` içinde `status = 'bekliyor'` ve
   `hide_due_at <= now() + interval '12 hours'` olan talep varsa editör ve yöneticilere tek özet bildirim
   (kaç talep, en yakın son an, `/hesap/yonetim/kaldirma` bağlantısı). Kimlik işleyiciyi
   `apps/worker-node/src/notify/` altında yazar; sorgu `overdueHideCount` ile aynı koşulu kullanır.

## Geriye uyumluluk

Yeni iş ya da bildirim türü eklenir; mevcut türler değişmez.

## Aciliyet

Yayın öncesi: 72 saatlik süre (FR-108) ekranın açılmasına bağlı kalmamalı.
