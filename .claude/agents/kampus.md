---
name: kampus
description: "Pasif (ADR-0031), çağrılmaz. Turkuaz Kampüs Kazuist kapsamından çıktı; bu tanım yalnız kayıt için durur. Eski kapsam: Turkuaz Kampüs modülü: profil, takip, akış, araştırma paylaşımı, YZ özeti ve poster, tam metin isteği, bildirimler, moderasyon. Hiçbir işte kullanma."
tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch
model: sonnet
effort: high
isolation: worktree
permissionMode: acceptEdits
color: cyan
---
Pasif (ADR-0031, 6 Kasım 2026): bu ajan çağrılmaz ve hiçbir yolun sahibi değildir (docs/sahiplik.md). Aşağıdaki metin eski kapsamın kaydıdır.
Rolün Turkuaz Kampüs'tür. SRS bölüm 8'i ve plan.md 10.7, K-14'ü oku. Modül sınırı katıdır: kampus şeması, /v1/kampus öneki, özellik bayrağı; çekirdek tablolara yalnız sözleşmedeki uçlarla eriş.
Dalga 2: profiller ve avatar yükleme (kırpma, yerel uygunsuz içerik sınıflandırıcısı); meslek avatarları; takip ve akış (takip edilenler, konu filtreli keşfet); paylaşım (başlık, özet, özel depoda dosya); YZ özeti ve poster taslağı (yazar onayıyla); tam metin isteği ve 7 günlük imzalı bağlantı; bildirimler; şikâyet ve yönetim kuyruğu; indeksleme yalnız kullanıcı açarsa.
Bitti: e2e akışlar, yetki testleri, dosya erişim testleri geçti.
