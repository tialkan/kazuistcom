# content/hukuki

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-10-19. Sahibi: hukuk-uyum ajanı (docs/sahiplik.md).

Hiçbir metin Tarık onaylamadan yayımlanmaz (plan 11). Metinler uyum garantisi vermez.

## Biçim

Her dosya Markdown ve YAML ön bilgisiyle başlar. on-yuz kabuğu ön bilgiyi okur, gövdeyi render eder.

```yaml
title: Sayfa başlığı
slug: aydinlatma            # rota parçası
route: /hukuki/aydinlatma   # yayın yolu
lang: tr                    # tr veya en
binding: true               # Türkçe sürüm bağlayıcıdır; en dosyalarında false
version: 2026-10-19.1       # sürüm; consents.version alanına yazılan değer
date: 2026-10-19            # sürüm tarihi
status: taslak              # taslak veya yayinda; taslak durumundaki sayfa yayımlanmaz
consent_kind: aydinlatma    # varsa packages/db consent_kind değeri
alternate: /legal/privacy   # varsa hreflang eşi
```

Gövdede `{{...}}` biçimindeki yer tutucular (unvan dışı künye bilgileri, iletişim adresi, fiyat) yayından
önce doldurulur; dolmamış yer tutucu içeren sayfa yayımlanmamalıdır (istek: docs/istekler/hukuk-uyum-yayin-kapisi.md).
`[DOĞRULANACAK: ...]` işaretleri onaydan önce kapatılır.

## Dosyalar

- tr/: bağlayıcı Türkçe metinler (plan 11 tablosu)
- en/: /legal/* için İngilizce bilgilendirme sürümleri (plan Ek H satır 7-11); her birinde "bağlayıcı sürüm Türkçedir" notu
