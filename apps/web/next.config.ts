import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './src/server/security-headers.ts';

const config: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@kazuist/contracts', '@kazuist/i18n', '@kazuist/ui'],
  // plan 5.6/1: static security headers on every path, API included; the CSP comes from src/proxy.ts.
  async headers() {
    return [{ source: '/:path*', headers: staticSecurityHeaders() }];
  },
  // Ek H rows 18-22: one 301 from the Casuist Turkish legal pages to the product legal pages.
  async redirects() {
    return [
      {
        source: '/tr/hukuki/:belge(uyari|gizlilik|cerezler|yapay-zeka|erisilebilirlik)',
        destination: '/hukuki/:belge',
        statusCode: 301,
      },
    ];
  },
};

export default config;
