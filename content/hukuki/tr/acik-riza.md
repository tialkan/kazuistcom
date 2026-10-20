---
title: Açık rıza metinleri
slug: acik-riza
route: /hukuki/acik-riza
lang: tr
binding: true
version: 2026-10-19.1
date: 2026-10-19
status: taslak
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 19 Ekim 2026.

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

"Kendi YZ anahtarımla yapılan bu işlemin, sağlayıcı tarayıcıdan çağrıya izin vermediği veya iş uzun sürdüğü
için Kazuist sunucusu üzerinden iletileceğini anladım. Sunucudan yalnız kişisel verilerden arındırılmış metin
geçer, anahtarım ve içerik saklanmaz ve kayda yazılmaz. Metin, seçtiğim sağlayıcının bulunduğu ülkeye gider."

[DOĞRULANACAK: bu onay hukuken açık rıza mı, yoksa bilgilendirme teyidi mi; maskeli metin kişisel veri
taşımıyorsa açık rıza dayanağı gerekmeyebilir. Hukukçu görüşü.]

## 4. Gemini ücretsiz katmanında yayımlanmamış içerik gönderme

"Gemini anahtarımın ücretsiz katmanda olduğunu veya bunu bilmediğimi biliyorum. Google'ın koşullarına göre
ücretsiz katmanda gönderilen içerik ve cevaplar ürün geliştirmede kullanılabilir ve insan incelemesine
girebilir. Yayımlanmamış taslağımı veya Kampüs dosyamı yine de bu sağlayıcıya göndermek istiyorum."

Bu onay için şemada ayrı bir consent_kind değeri yoktur (istek: docs/istekler/hukuk-uyum-consent-turleri.md).

## 5. 2.0: ilgi alanı analizi

1.0'da yoktur. Eklenirse ayrı açık rıza metni yazılır.
