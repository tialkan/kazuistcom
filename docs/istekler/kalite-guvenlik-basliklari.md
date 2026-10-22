# İstek: güvenlik başlıkları ve nonce'lu CSP (plan 5.6/1)

Kimden: kalite-guvenlik (dal dalga-1/kalite-guvenlik/kapi). Kime: altyapi (tasarım ve uygulama), orkestra
(`apps/web/next.config.ts` ve gerekirse `apps/web/src/proxy.ts` ortak dosya/atanmamış yol). Kaynak:
docs/kalite/dalga-1.md Y-01 (yüksek), D-04. Aciliyet: yüksek; Dalga 1E WebSECRobot kapısı bu olmadan geçmez.

## Gözlenen

Yerel üretim derlemesinde hiçbir sayfa ve API yanıtında `Content-Security-Policy`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` yok. `X-Powered-By` kapalı (doğru).
Depoda bu başlıkları kuran yapılandırma yok (yalnız bakım sayfası nginx'inde nosniff). Sayfa başında
`<meta name="kazuist-version">` yok (plan 14.8).

## Beklenen (plan 5.6/1, 14.5, 14.8)

1. CSP: `default-src 'self'; script-src 'self' 'nonce-<istek başına>'` (`'strict-dynamic'` gerekiyorsa
   belgeyle), `object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
   `unsafe-eval` ve `unsafe-inline` (betik) yok; üçüncü taraf betik yok. Next.js'in nonce akışı için resmî
   belge okunmalı; statik önceden oluşturulan sayfalar istek başına nonce alamaz, bu sayfaların işlenme
   biçimi kararı (dinamik işleme ya da hash tabanlı CSP) ADR veya istek sonucu olarak yazılmalı.
2. `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
   `Permissions-Policy` (kamera, mikrofon, konum vb. kapalı), API yanıtları dahil.
3. HSTS: plan 14.5'e göre HTTPS doğrulandıktan sonra; `includeSubDomains` ve `preload` ayrı ADR. Uygulama mı
   Traefik mi gönderecek, tek yer seçilmeli (iki kaynak çelişir).
4. `<meta name="kazuist-version" content="<commit>">` kök layout'ta.

## Doğrulama

`tests/security/http/basliklar.spec.ts` (yerel: `KAZUIST_SEC_BASE_URL=http://localhost:3300`; staging:
`KAZUIST_SEC_EXPECT_HTTPS=1`). Test her `<script>` etiketinde başlıktaki nonce'u da arar.

## Sonuç

(altyapi ve orkestra dolduracak)
