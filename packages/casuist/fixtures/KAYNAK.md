# Fikstür derlemi: kaynak ve yeniden üretim

Sürüm `fikstur-2026-11-07`, 75 kayıt. Yalnız testler, `eval/rag` ölçümü ve veritabanı olmayan yerel geliştirme içindir.
Üretimde arama bu dosyayı okumaz (`apps/web/src/app/ara/_sunucu/baglam.ts`, `NODE_ENV=production` iken fikstür
yalnız `KAZUIST_FIKSTUR_URETIMDE=1` ile açılır; bu değişken üretim ortamında tanımlanmaz).

## İçerik ve kaynaklar (7 Kasım 2026'da alındı)

| Kayıt | Kaynak | Not |
|---|---|---|
| 6698 sayılı Kişisel Verilerin Korunması Kanunu, m.1-33 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf | Değişiklik dipnotları ve sayfa numaraları çıkarıldı; madde metni değiştirilmedi |
| 6098 sayılı Türk Borçlar Kanunu, m.49-75 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6098.pdf | Haksız fiil ayırımı |
| 2709 sayılı Anayasa, m.13, 20, 90, 148, 153 | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.2709.pdf | |
| Yargıtay kararları (7) | https://karararama.yargitay.gov.tr/ (aramalist ve getDokuman, belge numaraları aşağıda) | Kaynağında anonim yayımlanmış metin; kişi adı taraması yapıldı |
| KVKK Kurul kararı 2024/592 özeti | services/worker-py/tests/fixtures/kvkk/detay-2024-592.html (https://www.kvkk.gov.tr/Icerik/8881/2024-592) | veri-toplama fikstüründen |
| GDPR (Tüzük (AB) 2016/679) Art. 1-2 | services/worker-py/tests/fixtures/eurlex/32016R0679-ilk2.xhtml (CELEX 32016R0679) | veri-toplama fikstüründen |

Kanun kayıtlarının `date` alanı resmî metnin başlığındaki Resmî Gazete yayım tarihidir (6698: 7/4/2016, 6098:
4/2/2011, 2709: 9/11/1982). Karar tarihleri Yargıtay sonuç listesindeki `kararTarihi` alanıdır.

Yargıtay belge numaraları: 746229100 (12. CD 2019/14037 E. 2022/2232 K.), 1196596300 (4. HD 2023/12295 E. 2025/14577 K.),
899210400 (7. CD 2023/30 E. 2023/2890 K.), 729300000 (HGK 2018/20 E. 2021/1383 K.), 54419600 (HGK 2012/4-179 E.
2012/412 K.), 77008700 (HGK 2006/3-533 E. 2006/566 K.), 831914500 (7. CD 2022/4129 E. 2022/15232 K.).
232360600 (HGK 2014/213 E. 2016/70 K.) davalının il ve oda başkanlığı bilgisiyle dolaylı olarak tanınabildiği için
alınmadı.

Kaynak dosyaların SHA-256 özetleri: 6698.pdf `1ad27253b0068d4c3d991b92b68c6bc1104439430160f4350a3f04fbb211f2b5`,
6098.pdf `052287d8111a07612974f31a71ed3c90e9743aa28d77a005846e4c392316b9d9`, 2709.pdf
`58de994c36ae00e6dc86c00b886c808d7bee1a2306b9ac35bf8aec9e8d297d1f`. Çıktı içeriği özeti `kayitlar.json` içindeki
`sha256` alanındadır.

Kanun numarası tablosu (`src/laws.ts`) aynı gün mevzuat.gov.tr resmî metinlerinin ilk sayfasından doğrulandı: 4721,
5237, 6100, 5271, 2004, 6102, 2577, 4857, 6502, 5846, 4054 (ve fikstürdeki 6698, 6098, 2709).

Kaynak kullanım koşulları ve Tarık onayı `docs/kaynaklar/` altındadır ve bekliyor; bu derlem tek seferlik, düşük hızla
(istekler arasında 2,5 sn) elle alınmış bir test örneğidir, bağlayıcı değildir.

## Yeniden üretim

Boş bir klasöre resmî PDF'leri ve Yargıtay belgelerini indirin, sonra:

```sh
pdftotext -layout 6698.pdf 6698.txt   # 6098 ve 2709 için de
python3 -I packages/casuist/fixtures/uret_fikstur.py <klasör> services/worker-py/tests/fixtures > packages/casuist/fixtures/kayitlar.json
pnpm exec prettier --write packages/casuist/fixtures/kayitlar.json
```

Yargıtay belgeleri `https://karararama.yargitay.gov.tr/getDokuman?id=<no>` cevabındaki `data` alanının HTML'den
arındırılmış hâlidir ve `y<no>.txt` adıyla kaydedilir. Betik hukuki metni yeniden yazmaz; yalnız madde ve karar
başlıklarını keser, dipnotları ve sayfa numaralarını ayıklar.
