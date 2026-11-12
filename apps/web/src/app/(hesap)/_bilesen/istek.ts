import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

/** Result of a same origin JSON call from the account pages. */
export interface Yanit<T> {
  ok: boolean;
  status: number;
  veri: T | null;
  /** Text safe to show: our API's own (i18n) message, or a generic one. Never a provider message. */
  mesaj: string | null;
}

/**
 * JSON request to our own origin. The browser sends the HttpOnly session cookie and Origin (CSRF check in
 * withAuth and Better Auth). Error text from /api/v1 comes from hesap.json on the server; Better Auth
 * messages are English and internal, so only the status is used for them.
 */
export async function istek<T = unknown>(
  url: string,
  init: { method?: string; govde?: unknown } = {},
): Promise<Yanit<T>> {
  try {
    const res = await fetch(url, {
      method: init.method ?? (init.govde === undefined ? 'GET' : 'POST'),
      headers: init.govde === undefined ? undefined : { 'content-type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: init.govde === undefined ? undefined : JSON.stringify(init.govde),
    });
    const text = await res.text();
    let veri: unknown = null;
    try {
      veri = text ? JSON.parse(text) : null;
    } catch {
      veri = null;
    }
    let mesaj: string | null = null;
    if (!res.ok) {
      const kendi = url.startsWith('/api/v1/') || url.startsWith('/api/auth/step-up/');
      const m = (veri as { message?: unknown } | null)?.message;
      mesaj = res.status === 429 ? tr.hata.cokFazla : kendi && typeof m === 'string' && m ? m : null;
    }
    return { ok: res.ok, status: res.status, veri: res.ok ? (veri as T) : null, mesaj };
  } catch {
    return { ok: false, status: 0, veri: null, mesaj: tr.hata.genel };
  }
}

/** Fills `{name}` placeholders of an i18n template. */
export function doldur(sablon: string, degerler: Record<string, string | number>): string {
  return sablon.replace(/\{(\w+)\}/g, (_, k: string) => String(degerler[k] ?? `{${k}}`));
}

/** Date in Turkish long form, for example 12 Kasım 2026. */
export function tarihTr(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(
    new Date(iso),
  );
}
