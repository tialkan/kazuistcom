import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@kazuist/contracts', '@kazuist/i18n', '@kazuist/ui'],
};

export default config;
