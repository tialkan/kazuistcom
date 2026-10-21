---
kaynak: eurlex
alan_adlari: [publications.europa.eu, op.europa.eu]
robots_alan_adlari: [publications.europa.eu]
hiz_rps: 0.5
lisans_dayanagi: "AB yeniden kullanım kararı (2011/833/AB)"
protokol_durumu: gerekmez
tarik_onayi: bekliyor
---

# EUR-Lex ve CELLAR (seçili metinler)

Plan 6.1: GDPR, DSA, DMA, YZ Tüzüğü ve seçili ABAD kararları; CELLAR; aylık. Bu aşamada yalnız dört tüzük (CELEX
32016R0679, 32022R2065, 32022R1925, 32024R1689). ABAD kararları sonraki aşama. Tarık onayı: bekliyor.

## Kullanım koşulları ve lisans

AB kurumlarının belgeleri 2011/833/AB sayılı Komisyon Kararı kapsamında yeniden kullanıma açıktır (plan 6.1 dayanağı);
karar metni bu çalışmada yeniden okunmadı, atıf ve değişiklik yapmama koşulları DOĞRULANMADI. Kullanıcıya her zaman
resmî EUR-Lex bağlantısı gösterilir (`https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:<no>`); kayıt
`sourceUrl` alanı bu bağlantıdır.

## robots.txt ve bot koruması (2026-10-19)

- `eur-lex.europa.eu/robots.txt` HTTP 202 ve `x-amzn-waf-action: challenge` (AWS WAF meydan okuması) döndürüyor: EUR-Lex
  sayfaları otomatik istemciye kapalı. Bu yüzden `eur-lex.europa.eu` izin listesinde YOK ve çekilmez.
- CELLAR yayın kaynağı `publications.europa.eu/resource/celex/<CELEX>` `op.europa.eu/robots.txt` dosyasına yönleniyor
  (HTTP 200): `User-agent: *` / `Allow: /`; Disallow satırları portal oturum, sepet, `requestAction=rdf`, `/webdav/`,
  `/s/*` gibi yollar. `/resource/celex/...` ve `/resource/cellar/...` yolları engellenmemiş. Kod `*` ve `$` joker
  karakterlerini RFC 9309'a göre değerlendirir.
- Yönlendirme zinciri `http://publications.europa.eu/resource/cellar/...` adresine gider; kod yalnız izin listesindeki
  ana makineler için http'yi https'ye yükseltir ve her atlamayı yeniden doğrular.

## Hız

0,5 istek/sn. Geliştirmede yaklaşık 6 HTTP isteği (eur-lex robots ve başlık sorgusu, publications robots ve yönlendirmesi,
tüzük ve yönlendirmesi; 0,8 MB), yani 5 sınırı aşıldı. Fikstür GDPR madde 1 ve 2.

## Tarık'tan

Onay: bu dosyada `tarik_onayi: onaylandi`. Türkçe çeviri resmî olmadığından kayıtlar İngilizcedir (`jurisdiction=EU`).
