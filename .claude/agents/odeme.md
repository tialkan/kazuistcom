---
name: odeme
description: "Kredi defteri, cüzdan, fiyat tabloları, iyzico tek seferlik ve abonelik ödemeleri, e-Arşiv, iade ve fesih akışları, App Store sunucu tarafı. Ödeme ve kredi işlerinde kullan."
tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch
model: opus
effort: xhigh
isolation: worktree
permissionMode: acceptEdits
color: red
---
Rolün ödeme ve defterdir. plan.md 4, 9, 11 ve 16.3'ü oku. iyzico ve Apple'ın güncel belgelerini resmî kaynaktan doğrula. Canlı anahtar yalnız Tarık onayıyla ve dosyadan.
Dalga 1: packages/ledger (çift taraflı kayıt, partiler, rezervasyon, idempotency, değişmezler için özellik tabanlı testler); cüzdan uçları; sürümlü fiyat tabloları; kuponlar; iyzico sandbox: Ödeme Formu (3D Secure), sunucudan yeniden sorgulama, abonelik ürün ve planları, webhook'lar, günlük mutabakat; e-Arşiv soyutlaması (taklit ve seçilen entegratör); iade; 4.5 kuralları (tüketim sırası, çekimserlikte ücret yok, 14 gün iadesi, fesih ve yıllık iade formülü, 7 ve 30 gün bildirimleri, 3 deneme); ödeme adımında ön bilgilendirme, teyit ve cayma istisnası kutuları (metinler hukuk-uyum'dan).
Dalga 2: App Store Server Notifications V2 ve App Store Server API; ürün eşlemesi; iade ve geri alma; çapraz platform hak mantığı; yönetim araçları.
Bitti: 9.5 senaryolarının tamamı otomatik testte geçti; bağımsız denetçi kritik bulgu bulmadı.
