# Kazuist proje kuralları

Bu depo Kulular Bilişim Teknolojileri Ltd. Şti.'nin Kazuist ürünüdür. Tek doğruluk kaynağı plan.md'dir;
SRS (docs/kaynak/Kazuist.docx) ile çelişkide plan.md geçerlidir. Bağlayıcı rehberler:
~/Desktop/promptlar/siteyarat.md, webtasarim.md, appstore.md.

## Dil
- Kod, tanımlayıcılar ve commit mesajları İngilizce ve açıklayıcı.
- Arayüz metinleri yalnız packages/i18n üzerinden; kaynak dil Türkçe; hitap "siz", Kalemcik "sen".
- docs/ altındaki belgeler Türkçe.

## Metin kuralları
- Uzun çizgi (U+2014) hiçbir dosyada kullanılmaz; CI yakalar.
- Yasak ifadeler content/yasak-ifadeler.txt'dedir. Emoji süsü yoktur.
- Türkçe büyük harf toLocaleUpperCase('tr-TR') ile; özel adlar otomatik küçültülmez.
- Unvan, sicil, tarih ve rakam tahmin edilmez; birincil kaynaktan doğrulanır.

## Güvenlik
- Parola, token, anahtar ve .env değeri sohbete, depoya, loga ve rapora yazılmaz. Değerler
  ~/Desktop/kazuist-*.txt dosyalarındadır; yalnız yol kullanılır ve çıktıda gösterilmez.
- Her uçta zod doğrulaması ve sunucu tarafı yetki. Kullanıcı girdisi HTML'e ham basılmaz.
- Dış YZ sağlayıcısına yalnız anonim veya maskeli metin gider; içerik loglanmaz.
- Yeni bağımlılık için gerekçe ve lisans kontrolü; AGPL ve SSPL ADR'siz eklenmez.
- Geri dönüşü zor işlemler (DNS, canlı ödeme, veri silme, yıkıcı migration, App Store gönderimi) Tarık'ın açık onayıyla.

## Sahiplik
- Yalnız docs/sahiplik.md'de sana verilen yolları değiştir. packages/contracts ve packages/db yalnız mimar ve ADR ile
  değişir; ihtiyacını docs/istekler/<ajan>-<konu>.md olarak yaz.
- Kök package.json, kilit dosyası ve uygulama kök düzeni orkestra tarafından birleştirilir.

## Komutlar
- pnpm i, pnpm dev, pnpm typecheck, pnpm lint, pnpm test, pnpm e2e, pnpm build
- docker compose -f infra/docker-compose.dev.yml up -d
- services/worker-py içinde: uv sync, uv run pytest

## Bitti tanımı
- Testler yazıldı ve geçti; tip ve lint temiz; üretim derlemesi geçti.
- Arayüz değiştiyse 375, 768, 1440 px ekran görüntüsü ve axe sonucu.
- DEVIR.md'nin en üstüne kendi bölümün eklendi; docs/ilerleme.md güncel.
- Dal itildi ve `gh pr create` ile PR açıldı; PR açıklaması aşağıdaki rapor biçiminde.
- Doğrulanmamış hiçbir şey tamamlandı diye yazılmadı; veri alınamayan ölçüm geçmedi sayıldı.

## Rapor biçimi (alt ajanın son mesajı)
## Sonuç
## Yapılanlar (dosyalar)
## Doğrulama (komut ve çıktı özeti)
## Dokunulmayanlar
## Açık işler ve kesin sonraki adım
## Tarık'tan gerekenler (tam URL, menü ve alan adıyla)
