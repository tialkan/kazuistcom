import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from './server/security-headers.ts';

/**
 * Per request nonce and Content-Security-Policy (plan 5.6/1, Next.js 16 CSP guide). Next.js reads the nonce
 * from the request CSP header and puts it on its own scripts; pages render per request (root layout).
 * The other security headers are static and come from next.config.ts headers() for every path, API included.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|fonts/|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
