# eval/rules: kural çıkarma ölçümü (plan 15.3/3)

Sahibi yazma ajanıdır. Ölçüt: 10 kılavuzda çekirdek alanlarda (kenar boşlukları, yazı tipi, punto, satır aralığı, sayfa numarası, atıf sistemi) %95 ve üstü doğruluk; 3 kılavuzda hatasız .docx. Veri alınamayan ölçüm geçmedi sayılır.

## Parçalar

- `kilavuz/*.txt`: birincil kaynaktan alınmış kılavuz metni. Şimdilik beş hukuk dergisinin DergiPark yazım kuralları sayfası (AÜHFD, SDÜHFD, TAÜHFD, YÜHFD, TOGÜHFD). Her dosyanın başında kaynak adresi ve alınma tarihi var; sayfa 7 Kasım 2026'da tek istekle, KazuistBot kimliğiyle alındı (robots.txt `writing-rules` yolunu yasaklamıyor). DergiPark ile ULAKBİM protokolü henüz yok (docs/protokol/ulakbim.md taslak): bu klasör toplu çekmenin başlangıcı değildir, elle seçilmiş örnekler.
- `altin/*.json`: kılavuzun neyi söylediğine dair altın etiketler. `alanlar` kılavuzda yazan değer ve birebir alıntıdır; `bos` kılavuzun söylemediği alanlardır (çıkarıcı bunlar için "Kılavuzdan" iddia ederse yanlıştır). Etiketleri yazma ajanı yazdı; editör doğrulaması bekliyor. `apps/web/src/app/yazma/altin.test.ts` her alıntının kılavuzda birebir geçtiğini ve değeri içerdiğini CI'da sınar.
- `olc.ts`: ölçüm betiği. `node eval/rules/olc.ts` (oracle kipi: altın etiketler model yerine geçer; hattı, etiketleri, docxcheck'i ve LibreOffice'i sınar, model doğruluğunu ölçmez) ve `node eval/rules/olc.ts --mod=canli` (YAZMA_YZ=acik ve OPENROUTER_API_KEY gerekir; gerçek model). Rapor `raporlar/<tarih>-<kip>.{json,md}` dosyalarına yazılır.
- `uret-fikstur.ts`: `services/worker-py/docxcheck/tests/fixtures` altındaki üç .docx'i şablon üreticisinden yeniden üretir. Üç sentetik kural kümesi (kenar boşluğu, yazı tipi, punto, satır aralığı, numara konumu farklı) hiçbir enstitünün kuralı değildir.
- `ekran/`: 375, 768 ve 1440 px ekran görüntüleri (yalnız ana durumlar saklandı) ve 39 ölçümün tamamının axe ve yatay taşma sonucu (`dogrulama.json`: 0 ihlal, 0 taşma). Ölçüm yerel üretim derlemesi, PostgreSQL 18 betik veritabanı ve gerçek docxcheck servisiyle Brave (Chromium) üzerinde yapıldı.
- `el-kontrol-kaydi.md`: Word ve Google Docs elle kontrol kaydı (bekliyor).

## Son ölçüm (oracle, 7 Kasım 2026)

Çekirdek alan: 43/43 (hat ve etiket tutarlılığı, model değil). Beş kılavuzdan üretilen .docx'in beşi ve üç sentetik tez/makale şablonu docxcheck ve LibreOffice denetiminden hatasız geçti. Plan ölçütü "çekirdek %95" **geçmedi**: canlı model ölçümü yapılamadı ve kılavuz sayısı 5 (gereken 10). "3 kılavuzda hatasız .docx" geçti.

## Sıradaki

10 kılavuza tamamlamak için enstitü tez kılavuzlarının (ASBÜ ve dokuz kılavuz) PDF'leri elle seçilip `kilavuz/` altına konmalı ve altın etiketlenmeli; ardından `--mod=canli` ile ölçüm.
