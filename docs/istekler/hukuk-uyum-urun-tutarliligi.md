# İstek: hukuki metinlerle ürün davranışı arasındaki tutarsızlıklar

İsteyen: hukuk-uyum, dal dalga-1/hukuk-uyum/metinler. Her madde ilgili ajana ve gerekiyorsa mimara gider.

1. Plan 4.5 dayanak atıfları (orkestra, plan sahibi): Abonelik Sözleşmeleri Yönetmeliği (RG 24/1/2015, 29246)
   m.2/2'ye göre bu tür aboneliklere yalnız m.5, 6, 7, 8, 13, 22, 23, 24, 25 uygulanır (resmigazete.gov.tr
   özgün metni). Plan 4.5/7'deki m.15 ve m.16, 4.5/8'deki m.19-20 ve 4.5/9'daki m.22 (fiyat değişikliği)
   atıfları kanuni zorunluluk olarak yazılmamalı; metinlerde gönüllü taahhüt olarak yazıldı.
   [DOĞRULANACAK: sonraki değişikliklerle liste değişti mi].
2. Abonelikte cayma (odeme, Tarık kararı): plan 4.5/4 yalnız paket için 14 gün kuralı koyuyor. Aboneliğin ilk
   dönem kredisi hiç kullanılmamışsa ne olacağı tanımlı değil; cayma istisnası onay kutusu abonelik adımında da gösterilmeli.
3. Hesap silme (kimlik, mimar): users.deleted_at var, kalıcı silme veya anonimleştirme işi ve süresi tanımlı değil.
   jobs enum'unda ilgili iş türü yok.
4. OAuth belirteçleri (kimlik): accounts.access_token ve refresh_token yalnız giriş için gerekmiyorsa saklanmamalı
   veya şifreli tutulmalı (veri minimizasyonu).
5. Bildirim içeriği (kimlik notify, ios): APNs ve Web Push yurt dışı itme hizmetlerinden geçer; bildirim metninde
   kişisel veri, karar özeti veya taslak içeriği olmamalı (docs/kvkk/aktarim.md).
6. Saklama süreleri (mimar, altyapı): sessions, audit_log, consents, takedown_requests, sources_raw için imha
   politikası ve periyodik silme işi yok.
7. Arama sorguları (casuist, ios): sorguların hesapla ilişkilendirilerek saklanıp saklanmadığı belirsiz; App
   Privacy "Search History" cevabı buna bağlı.
8. Canlı site (on-yuz, icerik): mevcut /tr/hukuki/yapay-zeka "nitelikli hukukçular için karar destek aracı"
   konumlandırması kullanıyor; plan 1 ve ADR-0001 kitleyi öğrenci, akademisyen ve meslek adayı olarak tanımlıyor.
   Yeni metin (content/hukuki/tr/yapay-zeka.md) planı izler.
9. Analitik (altyapı): Umami saklama süresi ve çerez kullanıp kullanmadığı yapılandırmadan teyit edilmeli;
   çerezsiz çalışıyorsa çerez politikası buna göre düzeltilir.
10. Yaş sınırı (Tarık): kullanım koşulları ve gizlilikte 18 yaş taslak olarak yazıldı; kayıtta yaş beyanı alınmıyor.

## Sonuç (mimar, 2026-10-20, dal dalga-1/mimar/istekler)

Yönlendirildi. Sözleşme payı uygulandı: hesap silme için `account.purge` iş türü (madde 3). Diğer maddeler
sahiplerine: 1 orkestra (plan atıfları), 2 odeme ve Tarık (abonelikte cayma), 3 ve 4 ve 5 ve 10 kimlik
(Better Auth `account.encryptOAuthTokens`, bildirim içeriği testi, yaş beyanı), 5 ve 7 ios, 6 hukuk-uyum
(imha politikası; ardından mimar `retention.sweep`) ve altyapi, 7 casuist, 8 on-yuz, 9 altyapi.
Dosyalar: docs/istekler/mimar-yonlendirme-<ajan>.md.

Sözleşme v1.1; ADR'ler Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md.
