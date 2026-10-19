# Kişisel veri ihlali runbook'u

Kaynak: plan.md 5.6/10. Hukuki dayanak: 6698 sayılı KVKK md. 12/5 ve Kişisel Verileri Koruma Kurulu'nun 24.01.2019 tarihli ve 2019/10 sayılı kararı (ihlalin öğrenilmesinden itibaren en geç 72 saat içinde Kurul'a bildirim). Bildirim metni ve form hukuk-uyum ajanının `docs/kvkk/` belgeleriyle hazırlanır; bu runbook teknik akıştır. Kurum'a gönderim yalnız Tarık tarafından yapılır.

## Saat sıfır

İhlalin öğrenildiği an (ilk güvenilir işaret) T0 olarak UTC ve Türkiye saatiyle kayda geçer. 72 saat T0'dan sayılır.

## Adımlar

| Süre | Adım | Sorumlu |
|---|---|---|
| T0 + 1 saat | Olay kaydını aç (`docs/kvkk/ihlal-<tarih>.md`, depoya kişisel veri yazmadan); Tarık'a haber | Nöbetçi |
| T0 + 4 saat | Sınırlama: sızan anahtarı iptal et ve yenile; ilgili oturumları düşür; saldırı yolunu kapat (uygulamayı bakım sayfasına almak dahil) | Altyapı |
| T0 + 24 saat | Kapsam: hangi veri kategorileri, kaç kişi, hangi zaman aralığı; loglar ve denetim kaydı (audit_log) | Altyapı ve hukuk-uyum |
| T0 + 48 saat | Bildirim taslağı: Kurul'un ihlal bildirim formu alanlarına göre | Hukuk-uyum |
| T0 + 72 saat içinde | Kurul'a bildirim (Tarık); bilgi tamamlanmamışsa eksikler sonradan tamamlanmak üzere bildirim yapılır | Tarık |
| Makul en kısa sürede | İlgili kişilere bildirim (kişiye ulaşılabiliyorsa doğrudan, değilse uygun yöntemle) | Tarık |
| Sonra | Kök neden, düzeltici önlemler, runbook güncellemesi | Hepsi |

## Teknik kontrol listesi

1. Kanıtı koru: ilgili konteyner loglarını ve Traefik erişim loglarını dışa aktar; sunucuyu silme, önce anlık görüntü al.
2. Sırlar: `gitleaks git` ile depo; Coolify secret'ları; YZ sağlayıcı anahtarları; Cloudflare ve Coolify token'ları. Sızan her anahtar iptal edilir; geçmişten silmek yetmez.
3. Erişim: Coolify kullanıcıları, SSH anahtarları, veri tabanı rolleri gözden geçirilir.
4. Veri tabanı ve Valkey'in internete kapalı olduğu dışarıdan doğrulanır (`nmap -Pn -p 5432,6379 <ip>`).
5. Yedeklerin bütünlüğü ve ihlalden etkilenip etkilenmediği kontrol edilir.
6. Kayıtlara kişisel veri yazılmaz; olay kaydında yalnız kategori ve sayı.

## İletişim

Kurul bildirimi, ilgili kişi bildirimi ve kamuya açıklama Tarık onayı olmadan gönderilmez.
