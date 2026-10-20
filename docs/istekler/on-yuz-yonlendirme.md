# İstek: /tr/hukuki/* için tek 301 (on-yuz, Dalga 1)

Sahip: orkestra (apps/web/next.config.ts ortak dosya). Dayanak: Ek H satır 18-22, ADR-0002.

Next.js 16 `redirects` içinde `permanent: true` 308 döner; Ek H 301 istediği için `statusCode: 301` kullanılır
(node_modules/next/dist/lib/load-custom-routes.js izinli kodlar arasında 301 var).

```ts
async redirects() {
  return [{ source: '/tr/hukuki/:belge(uyari|gizlilik|cerezler|yapay-zeka|erisilebilirlik)', destination: '/hukuki/:belge', statusCode: 301 }];
},
```

Bu birleşene kadar apps/web/src/app/(casuist)/tr/hukuki/[belge]/page.tsx aynı hedefe 308 ile yönlendirir;
config yönlendirmesi rotalardan önce çalıştığı için birleşmeden sonra o sayfa devre dışı kalır ve silinebilir.
Kabul: `curl -sI https://<ortam>/tr/hukuki/gizlilik` 301 ve `location: /hukuki/gizlilik`.
