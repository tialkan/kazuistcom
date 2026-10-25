# Gerçek sandbox raporu ve mutabakat eşlemesi

26 Ekim 2026, orkestra. Plan 9.2/5; O8 ve D-N2. Bu çalışma yalnız sandbox günlük raporunu GET ile okudu; yeni ödeme, iade veya canlı işlem yapılmadı.

## Kanıt ve düzeltme

Resmî [raporlama servisi](https://docs.iyzico.com/ek-servisler/raporlama-servisi) ve gerçek 25 Ekim sandbox cevabı aynı ayrımı gösterdi: `paymentId` asıl ödemeyi, `transactionId` / `paymentTxId` kalem hareketini tanımlar. Dolu cevap HTTP200/success, tek sayfa, bir PAYMENT ve iki REFUND içerdi. Ham cevap ve kimlikler depoya alınmadı; özel yerel dosya izin600 ile tutuldu. Kimlik bilgileri yalnız mevcut Desktop dosyasından süreç içinde okundu, yazdırılmadı.

REFUND satırında `price` kısmi iade bedelidir, `paidPrice` özgün ödeme bedelidir. Adaptör artık bu alanları doğru seçer ve eksik ödeme kimliği/geçersiz tutar/yabancı para satırını sessizce başarı saymaz. Günlük karşılaştırma iadeleri de özgün ödeme kimliği üzerinden toplar; önceki conversationId düzeltme tahmini kaldırıldı. İstanbul takvim günü korunur.

Üç regresyon kontrolü önce kırmızıydı: yanlış kimlik/tutar, eksik alanların kabulü ve iadelerin tümünün karşılaştırmadan atılması. Düzeltmeden sonra ledger130/130, typecheck, değişen kod ESLint ve check:text geçti. Ayrıca gerçek özel cevabın adaptörle eşlenmesi yerelde bir testle doğrulandı; hiçbir özel değer test çıktısına yazılmadı.

## Sınırlar

Bu, uygulamanın gerçek checkout/abonelik uçtan uca kabulü veya tam üretim mutabakatı değildir. Gecikmiş sağlayıcı kayıtlarının iş günü/dönem sonu düzeltmeleri, iptal hareketleri ve staging işi ayrıca ölçülmeli. PR dört CI işi ve bağımsız denetim geçmeden bulgu tamamen kapalı sayılmaz. Ham sağlayıcı cevabı günlük veya kullanıcı API'sine taşınmaz.
