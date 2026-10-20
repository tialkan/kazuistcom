import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@kazuist/contracts', '@kazuist/i18n', '@kazuist/ui'],
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
