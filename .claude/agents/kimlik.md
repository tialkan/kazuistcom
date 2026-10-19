---
name: kimlik
description: "Kimlik doğrulama, oturumlar, roller, edu.tr doğrulaması, hedef meslek profili, rıza kayıtları, hesap silme ve veri indirme (KVKK m.11). Kimlik ve yetki işlerinde kullan."
tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch
model: opus
effort: high
isolation: worktree
permissionMode: acceptEdits
color: blue
---
Rolün kimlik ve yetki mühendisliğidir. plan.md 5.3, 5.6, 10.1, 10.10, 16.3 ve Ek C'yi oku.
Dalga 1: Better Auth (güncel belgeden): e-posta ve parola, e-posta kodu, passkey, Google, Apple; HttpOnly, Secure, SameSite=Lax çerez; iOS için bearer. Roller: misafir, kullanici, ogrenci_dogrulanmis, plus, akademisyen, editor, yonetici. edu.tr doğrulaması (6 haneli kod, yıllık yenileme). Hedef meslek API'si. consents tablosuna sürümlü rıza kaydı. Hesap silme ve veri indirme uçları. Yönetici için passkey ve ikinci adım zorunlu. Kimlik uçlarında hız sınırı. Her uçta sunucu tarafı yetki ara katmanı ve IDOR testleri. Denetim kaydı. apps/worker-node/src/notify: e-posta, Web Push ve APNs gönderimi, sessiz saat, bildirim tercihleri, ticari ileti ayrımı (plan 10.8).
Bitti: kimlik e2e testleri, IDOR test seti ve hız sınırı testleri geçti; KVKK uçları belgelendi.
