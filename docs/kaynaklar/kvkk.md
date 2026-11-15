---
kaynak: kvkk
alan_adlari: [www.kvkk.gov.tr]
hiz_rps: 0.5
lisans_dayanagi: "Resmî yayın; Kurul karar özetleri kurumun kendi sitesinde kamuya açık yayımlanır"
protokol_durumu: gerekmez
tarik_onayi: bekliyor
---

# KVKK Kurul karar özetleri

Plan 6.1: sayfa çekme, haftalık. Liste: `https://www.kvkk.gov.tr/Icerik/5406/kurul-karar-ozetleri` (sayfalı), her özet
için bir `Icerik/<no>/<yıl>-<karar no>` sayfası. Tarık onayı: bekliyor.

## Kullanım koşulları

Sitede kullanım koşulları veya telif bildirimi sayfası bu çalışmada bulunamadı (ana sayfada yalnız çerez aydınlatma
metni bağlantısı var); yeniden kullanım ve otomatik erişim hakkında yazılı hüküm DOĞRULANMADI. Dayanak: kurumun kendi
sitesinde kamuya açık yayımladığı Kurul karar özetleri. Özetler zaten ilgili kişi adı içermeyecek biçimde yayımlanır; yine
de plan 6.4/8 gereği anonimleştirme hattından geçer (kayıt `anonymized=false` başlar, `anon.run` kuyruğa girer).

## robots.txt (2026-10-19)

`/robots.txt` HTTP 302 ile ana sayfaya yönleniyor ve HTML döndürüyor: gerçek bir robots.txt dosyası YOK. RFC 9309'a göre
dosya yokluğu kısıtlama olmadığı anlamına gelir; kod, robots olmayan HTML gövdesini "kısıtlama yok" sayar. Bu yorum
kurumun niyetini göstermez; Tarık onayı sırasında bu kararın bilerek verilmesi gerekir.

## Hız ve protokol

0,5 istek/sn, haftalık. Protokol gerekmez. Geliştirmede 6 HTTP isteği yapıldı, yani 5 sınırı bir aşıldı: robots.txt
(yönlendirme izlendiği için 2 istek) ve bir ek başlık sorgusu, ana sayfa, liste, bir özet sayfası. Fikstürler: liste (ilk 6 özet, 14+ sayfa gezinmesi) ve 2024/592 sayılı karar özeti.

## Canlı kontrol (2026-11-15)

`core.cli probe kvkk`: 4 istek (robots.txt yönlendirmeli, liste, bir özet), liste sayfası 10 satır ve sonraki sayfa bağlantısı
var, 1 kayıt ayrıştırıldı (anonimleştirme kuyruğa girdi), hata oranı 0,0. Düzen değişmemiş.

## Tarık'tan

Robots yokluğunun kabulü ve onay: bu dosyada `tarik_onayi: onaylandi`.
