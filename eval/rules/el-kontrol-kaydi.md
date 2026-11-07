# Word ve Google Docs elle kontrol kaydı (plan 10.5/8, 15.3/3)

Durum: **bekliyor**. Bu kayıt doldurulmadan Word ve Google Docs kabulü geçmiş sayılmaz.

Denenen ve yapılamayan: 7 Kasım 2026'da Microsoft Word'ün (Mac) AppleScript ile açılıp PDF'e aktarılması denendi; otomasyon izni penceresi beklendiği için tamamlanmadı, doğrulanmış hiçbir şey yazılmadı. LibreOffice 26.x ile kontrol ise yapıldı (services/worker-py/docxcheck/tests): PDF'te ön kısım "i, ii, ..." ve ana metin "1, 2, ..." basıyor.

## Hazırlık

`eval/rules/uret-fikstur.ts` ile `services/worker-py/docxcheck/tests/fixtures/` altındaki `tez.docx`, `makale.docx` ve `tez-ust-sag.docx` üretilir.

## Kontrol listesi (her dosya için)

| Madde | Word | Google Dokümanlar |
|---|---|---|
| Dosya hatasız açılıyor (onarım uyarısı yok) | | |
| "Alanlar güncellensin mi?" sorusuna Evet denince içindekiler başlıklarla doluyor | | |
| Ön kısım sayfa numarası i, ii, ... (dış kapakta numara yok), ana metin 1, 2, ... | | |
| Kenar boşlukları ve A4 | | |
| Normal stili: Times New Roman 12, 1,5 satır aralığı, iki yana yaslı, girinti 1,25 cm | | |
| Başlık 1-3 stilleri, outline düzeyleri, Başlık 1 büyük harf | | |
| Dipnot ekleyince Dipnot Metni stili, 10 punto | | |
| Zotero eklentisi dipnot ekliyor | | |

Kaydeden, tarih, sürüm: (doldurulacak)
