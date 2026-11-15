# ADR-0001: Konumlandırma: kaynak bağlama çekirdeği ve kaynaklı özet

- Tarih: 2026-10-19
- Karar kodu: K-01 (plan.md bölüm 1)
- Durum: Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026)

## Bağlam

SRS "Kısa cevap" adında bir özellik tanımlıyor. kazuist.com bugün "Kazuist hukuki soruyu cevaplamıyor, cevabı denetlenebilir kılar" diyor ve Eurostars ortak çağrısı bu taahhüt üzerine kurulu. Ürün dili bu metinle çelişirse hem ortaklar hem kullanıcılar için güven kaybı olur.

## Karar

Kazuist, Casuist kaynak bağlama çekirdeği (packages/casuist) üzerine kurulu araştırma ve yazma platformudur. SRS'teki "Kısa cevap" arayüzde "Kaynaklı özet" adını alır: her cümle en az bir kaynağa bağlanır, her kaynak için birebir dayanak alıntısı doğrulanır (en az 20 karakter, pasaj gövdesinden alınır, normalize edilmiş haliyle pasajda geçer; 15 Kasım 2026, plan 7.4/3), dayanak yetersizse sistem çekimser kalır. Akış ve doğrulayıcı plan 7.4 ve Ek D'dedir.

## Gerekçe

Taahhüt edilen ürün dili ile davranış aynı olur. Aynı çekirdek Eurostars WP4'ün (retrieval, grounding, provenance) arka plan IP'sidir; ayrı ve saf fonksiyonlarla yazılması bu IP'yi korunabilir kılar.

## Sonuçlar

- SSE olay türleri sözleşmede sabittir: cumle, kaynaklar, uyari, cekimser, son (packages/contracts).
- Model çıktısı JSON Lines biçimindedir (cumle, yetersiz, son); şema zod ile tanımlıdır, anlamsal doğrulama packages/casuist'tedir.
- Çekimser sonuç kredi düşürmez (plan 4.5/3).
- Ölçütler (uydurma kaynak 0, desteksiz cümle %1 altı) Dalga 3 kapısıdır.

## Durum

Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026).
