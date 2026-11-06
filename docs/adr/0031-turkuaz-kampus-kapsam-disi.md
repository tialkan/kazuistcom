# ADR-0031: Turkuaz Kampüs kapsam dışı; /tespit eklendi

- Tarih: 2026-11-06
- Durum: Kabul edildi, 6 Kasım 2026 kullanıcı kararı
- İlgili kararlar: K-14; plan 1, 3, 10.7, 13, 17, 18; Ek A.11; ADR-0029

## Bağlam

Plan 1.0 kapsamında Turkuaz Kampüs modülü (K-14, plan 10.7, SRS FR-63..73) kazuist.com/kampus altında yer alıyordu. Dalga 2'de kampus ajanı başlayacaktı; kod yazılmadı. Sözleşme v1 ve şema v1'de `kampus` şeması, `/v1/kampus/*` öneki ve `kampus.summarize`, `kampus.poster` işleri tanımlıdır.

Kullanıcı 6 Kasım 2026'da Turkuaz Kampüs'ün Kazuist'in içinde olmayacağını açıkça bildirdi. Aynı gün kazuist.com/tespit adresinde yazım kuralları istemi ve tarayıcı içi yapay zekâ izi denetleyicisi istedi; bu sayfa PR #57 ile main'e alındı.

## Karar

1. Turkuaz Kampüs Kazuist kapsamından çıkar: 1.0, 1.1 ve 2.0 sürümlerinde yer almaz. K-14 kaldırılır.
2. kampus ajanı Dalga 2'de başlatılmaz; Ek A.11 tanımı ve .claude/agents/kampus.md dosyası pasif kalır, silinmez.
3. Kampüse bağlı ürün parçaları kalkar: Kampüs YZ özeti ve poster, tam metin isteği, Kampüs şikâyet kuyruğu, topluluk kuralları sayfası, ana sayfa Kampüs bandı, /kampus adresi, iOS Kampüs sekmesi, Turkuaz alt marka rengi.
4. Sözleşme ve şemadaki `kampus` tanımları bu ADR ile kullanım dışıdır. Kaldırılmaları mimarın bir sonraki sözleşme sürümünde, ayrı migration ile yapılır; bu ADR migration yazmaz. Tablolarda veri yoktur.
5. /tespit Kazuist 1.0 kapsamına girer: girişsiz ve ücretsiz yazım kuralları istemi (docs/tespit/yazim-kurallari.md) ve metni tarayıcıdan çıkarmayan kural tabanlı iz denetleyicisi. Sahibi yazma ajanıdır (`apps/web/src/app/tespit/**`, `packages/i18n/{tr,en}/tespit.json`, `docs/tespit/**`). Sonuç hiçbir zaman "yapay zekâ yazdı" yargısı veya yüzde olarak sunulmaz.

## Sonuçlar

- Dalga 2 ajan listesi ve takvim bir modül hafifler; Eurostars anlatısında Kampüs geçen yerler orkestra tarafından gözden geçirilir.
- Hukuki metinlerde (aydınlatma, gizlilik, topluluk kuralları) Kampüs geçen bölümler hukuk-uyum tarafından çıkarılır; yayım ayrı onay kapısındadır.
- Kampüs ayrı bir ürün olarak ileride yeniden gündeme gelirse yeni ADR gerekir.

## Onay kaydı

Kullanıcı 6 Kasım 2026'da "Turkuaz Kampüs olmayacak" kararını ve /tespit sayfasının kurulmasını açıkça verdi.
