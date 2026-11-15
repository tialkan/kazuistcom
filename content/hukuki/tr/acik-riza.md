---
title: Açık rıza metinleri
slug: acik-riza
route: /hukuki/acik-riza
lang: tr
binding: true
version: 2026-11-15.1
date: 2026-11-15
status: taslak
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 15 Kasım 2026. Dar çekirdekli ilk yayına göre (ADR-0038) madde 3 ve
> 4'e "şu anda kullanılmaz" notu eklendi: arayüz BYOK'u yalnız tarayıcıdan OpenRouter'a doğrudan çağrıyla sunar
> (apps/web/src/app/ara/_bilesen/OzetAlani.tsx yalnız platform modunu sunucuya gönderir) ve doğrudan Gemini anahtarı
> kabul etmez. Metinler, ilgili özellik açılırsa kullanılmak üzere tutuldu. Sürüm değişikliği yalnız bu notlardan
> ötürüdür; madde 2'nin onay metni değişmedi.

Açık rıza yalnız gereken yerde istenir (plan 11). Her biri ayrı onay kutusudur, önceden işaretli gelmez,
hizmetin şartı yapılmaz ve dilediğiniz an geri alınabilir. Onaylar sürümüyle consents tablosuna yazılır.

## 1. Analitik çerez (consent_kind: acik_riza_analitik)

Metin [çerez politikasında](/hukuki/cerezler) yer alır.

## 2. Ticari elektronik ileti (consent_kind: acik_riza_pazarlama)

"Kulular Bilişim Teknolojileri Ltd. Şti.'nin Kazuist kampanya, indirim ve yeni özellik duyurularını
e-posta ile göndermesine onay veriyorum. Onayım İleti Yönetim Sistemi'ne (İYS) kaydedilir; dilediğim an
her iletideki bağlantıdan veya hesap ayarlarından geri alabilirim."

Not: Ödeme bildirimi, fesih teyidi, teslim hatırlatması gibi bilgilendirme iletileri bu onaya bağlı değildir.

## 3. Yapay zekâ aktarma modu (consent_kind: yz_aktarim)

Şu anda kullanılmaz: Kazuist kendi anahtarınızla yapılan istekleri sunucu üzerinden aktarmaz; tarayıcınız
OpenRouter'a doğrudan bağlanır. Aşağıdaki metin, aktarma modu açılırsa onay kutusunda gösterilir.

"Kendi YZ anahtarımla yapılan bu işlemin, sağlayıcı tarayıcıdan çağrıya izin vermediği veya iş uzun sürdüğü
için Kazuist sunucusu üzerinden iletileceğini anladım. Sunucudan yalnız kişisel verilerden arındırılmış metin
geçer, anahtarım ve içerik saklanmaz ve kayda yazılmaz. Metin, seçtiğim sağlayıcının bulunduğu ülkeye gider."

Not: Bu onay, maskeleme sonrası metnin kişisel veri taşımaması hedeflendiği için bir bilgilendirme teyidi olarak
kurulmuştur; yurt dışına kişisel veri aktarımının dayanağı yapılmaz (docs/kvkk/aktarim.md).

## 4. Gemini anahtarı: ücretli faturalandırma beyanı

Şu anda kullanılmaz: Kazuist kendi anahtarınızla yalnız OpenRouter'ı destekler ve doğrudan Gemini anahtarı kabul
etmez. Doğrudan Gemini anahtarı desteklenirse anahtar yalnız bu beyanla kabul edilir; ücretsiz katman anahtarı
kullanılamaz (2026-10-23 kararı).

"Girdiğim Gemini API anahtarının Google hesabımda ücretli faturalandırmaya bağlı olduğunu beyan ederim. Beyanım
doğru değilse içeriğimin Google'ın ücretsiz katman koşullarına tabi olabileceğini biliyorum."

Bu beyan bir açık rıza değil, bilgilendirme teyididir; consents tablosunda yz_ucretsiz_katman türüyle
kaydedilir (sözleşme v1.1, ADR-0023).

## 5. 2.0: ilgi alanı analizi

1.0'da yoktur. Eklenirse ayrı açık rıza metni yazılır.
