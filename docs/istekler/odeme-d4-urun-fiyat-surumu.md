# D4 ürün fiyat sürümlemesi: ikinci migration isteği

Ödeme, 2026-10-25. Plan 9.4, ADR-0026.

Mevcut `products.code` tekilliği birden fazla `price_table_id` altında aynı ürünün
saklanmasını engelliyor. `products(code, price_table_id)` tekilliği 0004'te genişletme
adımı olarak var. Daraltma migration'ı mimarın sahipliğindedir.

İstenen sıralama:

1. Sipariş, abonelik ve fatura ilişkisinin bir ürün kodunu tek başına hedefleyen FK'si varsa
   önce sürümlü ürün kimliğine veya `(code, price_table_id)` anahtarına taşı; eski veriyi
   işlem tarihindeki `price_tables.effective_at` üzerinden açıkça doldur. Tarih aralığı belirsiz
   satır varsa migration sessizce güncel fiyatı seçmemeli, raporlayıp durmalı.
2. `products.code` tekil kısıtını, bağımlı FK'ler taşındıktan sonra kaldır. Birleşik tekillik kalsın.
3. Aynı kodlu iki fiyat sürümü; eski siparişin iadesi, yıllık fesih hesabı ve eski faturanın
   eski bedeli koruması; eski şemadan yükseltme testleri eklensin.
4. Ödeme deposu `ensureCatalog` upsert çakışmasını `(code, price_table_id)` ile kullanacak;
   `productSql` ve ilişkili seçimler işlemde dondurulmuş sürümü hedefleyecek.

DB veya contracts bu ödeme dalında değiştirilmedi. Migration ve ilişki sözleşmesi
hazır olduğunda ödeme bağdaştırıcısı ayrı PR'da uyarlanacak. Eski ürün satırları silinmeyecek.
