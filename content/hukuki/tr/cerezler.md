---
title: Çerez politikası
slug: cerezler
route: /hukuki/cerezler
lang: tr
binding: true
version: 2026-11-12.1
date: 2026-11-12
status: taslak
consent_kind: acik_riza_analitik
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 12 Kasım 2026. Tarayıcı depolaması bölümü koddaki anahtarlara göre
> (apps/web/src/app/pratik/_alan/depo.ts, deneme-oturumu.ts, rehberler/_alan/ilerleme.ts) genişletildi.

Dayanak: KVKK ve Kişisel Verileri Koruma Kurumu'nun çerez uygulamalarına ilişkin rehberi
"Çerez Uygulamaları Hakkında Rehber" (Kurumun internet sitesindeki güncel sürüm: Temmuz 2025, KVKK
Yayınları No: 69).

## 1. Kullandığımız çerezler

| Tür | Ne işe yarar | Süre | İzin |
|---|---|---|---|
| Zorunlu: oturum çerezi (kazuist.session_token; üretimde __Secure- ön ekli; HttpOnly, Secure, SameSite=Lax) | Girişinizi korur | 30 gün | Gerekmez |
| Zorunlu: giriş doğrulama çerezleri (kazuist.state, Google veya Apple ile girişte; kazuist.better-auth-passkey, geçiş anahtarıyla girişte; kazuist.two_factor, ikinci adım doğrulamasında; üretimde __Secure- ön ekli; HttpOnly, Secure, SameSite=Lax) | Giriş adımının sizin başlattığınız işlem olduğunu doğrular | 5 dakika; ikinci adım çerezi 10 dakika | Gerekmez |
| Analitik (Umami, kendi sunucumuzda) | Hangi sayfaların kullanıldığını kişisel veri tutmadan ölçer | Analitik henüz etkin değildir; etkinleştirilmeden önce bu satır yapılandırmadan güncellenir | Açık rızanız gerekir |

Reklam ve üçüncü taraf izleme çerezi kullanılmaz. Analitik etkin olmadığı için şu anda çerez tercihi sorulmaz
ve tercih çerezi kullanılmaz; analitik etkinleştirilmeden önce tercih kaydı ve süresi bu tabloya eklenir ve
sayfa yeni sürümle onaya sunulur.

## 2. Tarayıcı depolaması

Bazı özellikler, istediğiniz hizmeti sunmak için tarayıcınızın yerel deposunu (localStorage) kullanır. Bu veriler
çerez değildir, sunucumuza gönderilmez ve izin gerektirmez; tarayıcı ayarlarınızdan silebilirsiniz.

| Anahtar | Ne işe yarar | Ne kadar kalır |
|---|---|---|
| kazuist.pratik.v1 | Pratik kartlarındaki ilerlemeniz, tekrar zamanları ve ayarlarınız | Siz silene kadar |
| kazuist.pratik.deneme.v1 | Yarım kalan HMGS denemesinin durumu | Deneme bitince veya siz silene kadar |
| kazuist.rehber.v1 | Rehberlerde işaretlediğiniz adımlar | Siz silene kadar |

Yazım kuralları ve iz denetleyicisi (/tespit) tarayıcı deposu kullanmaz; yapıştırdığınız metin sayfayı
kapattığınızda gider.

Kendi YZ anahtarınızı (BYOK) girme özelliği kullanıma açıldığında anahtar varsayılan olarak yalnız o oturum için
tarayıcınızda (sessionStorage) tutulur; "bu cihazda hatırla" seçerseniz kalıcı depolamada (localStorage) kalır.
Anahtar sunucumuza kaydedilmez.

## 3. Tercih paneli

Bu bölüm analitik etkinleştirildiğinde uygulanır. İlk ziyarette "Kabul et" ve "Reddet" düğmeleri eşit büyüklükte ve eşit görünürlükte gösterilir. Reddetmek
siteyi kullanmanızı engellemez. Tercihinizi her sayfanın altındaki "Çerez tercihleri" bağlantısından
değiştirebilirsiniz.

### Tercih paneli metni

**Çerez tercihleri**

Zorunlu çerezler sitenin çalışması için gereklidir. Analitik ölçüm yalnız izin verirseniz çalışır; kişisel
veri tutmaz ve kendi sunucumuzda kalır.

- Zorunlu çerezler: Her zaman açık
- Analitik ölçüm: [ ] İzin veriyorum

Düğmeler: **Reddet** | **Kabul et** | **Seçimimi kaydet**

## 4. Analitik çerez açık rıza metni

"Kazuist'in, kullanım istatistiklerini ölçmek amacıyla kişisel veri içermeyen analitik çerezi kendi
sunucusunda çalıştırmasına izin veriyorum. İznimi dilediğim zaman Çerez tercihleri bağlantısından geri
alabilirim." (Kayıt: consents, kind = acik_riza_analitik, version = bu sayfanın sürümü)
