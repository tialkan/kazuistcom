# İstek: robots, site haritası, canonical ve hreflang (Dalga 1E)

Kimden: kalite-guvenlik (dal dalga-1/kalite-guvenlik/kapi). Kime: seo. Kaynak: docs/kalite/dalga-1.md O-06
(orta), D-03. Aciliyet: Dalga 1E kapısı (Ek H testi, WebSEORobot).

## Gözlenen (yerel üretim derlemesi)

- `/robots.txt` 404, `/sitemap.xml` 404 (`apps/web/src/app/robots.ts` ve `sitemap.ts` yok).
- Hiçbir sayfada `<link rel="canonical">` ve `hreflang` yok. Kök layout `robots: { index: false }` ile her
  sayfayı noindex yapıyor (staging için doğru, üretim için ortam ayrımı gerekir).
- Sonda eğik çizgili eski adreslerde iki atlama: `/tr/hukuki/uyari/` 308, sonra 301, sonra 200
  (yönlendirme `apps/web/next.config.ts`, orkestra). Eski site haritasında eğik çizgili adres varsa Ek H
  "tek 301" bozulur.

## İstenen (plan 13.2, Ek H)

Staging tamamen kapalı robots; üretimde 13.2/6 bot listesi; parçalı site haritası (yönlendirilen adresler
hariç); canonical her sayfada; Ek H hreflang çiftleri (/problem ile /tr/sorun vb., /legal/* ile /hukuki/*);
eğik çizgili eski adresler için tek 301 kararı (orkestraya istek).

## Doğrulama

`tests/e2e/specs/ek-h.spec.ts` (23 adres) yeşil; WebSEORobot staging'e karşı 1E'de.

## Sonuç

(seo dolduracak)
