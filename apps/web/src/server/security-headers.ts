/**
 * Security headers (plan 5.6/1, 14.5; wt.54-57). One place for both the per request CSP (src/proxy.ts) and
 * the static headers (next.config.ts headers()).
 */

/**
 * script-src: nonce + 'strict-dynamic', no 'unsafe-inline' and no 'unsafe-eval' outside development.
 * style-src keeps 'unsafe-inline' because React style attributes cannot carry a nonce; scripts stay strict,
 * which is what protects the BYOK key (plan 5.6/1).
 */
export function contentSecurityPolicy(nonce: string, dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export interface Header {
  key: string;
  value: string;
}

/**
 * Static headers for every response. HSTS only in production builds and without includeSubDomains and
 * preload (plan 14.5: those need their own ADR). Browsers ignore HSTS over plain HTTP.
 */
export function staticSecurityHeaders(env: Record<string, string | undefined> = process.env): Header[] {
  const headers: Header[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), ' +
        'magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()',
    },
    { key: 'X-Frame-Options', value: 'DENY' },
  ];
  if (env.NODE_ENV === 'production') {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000' });
  }
  return headers;
}
