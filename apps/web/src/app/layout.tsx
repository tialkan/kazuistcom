import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import '@kazuist/ui/tokens.css';
import '@kazuist/ui/fonts.css';
import '@kazuist/ui/components.css';
import { Kabuk } from './(kabuk)/_kabuk/Kabuk.tsx';
import { temelMetadata } from './(seo)/_seo/metadata.ts';

export function generateMetadata(): Metadata {
  return {
    // metadataBase, title template, robots by environment, canonical and OpenGraph: (seo)/_seo/metadata.ts.
    ...temelMetadata(),
    // plan 14.8: the deployed commit, read at run time from the image environment.
    other: { 'kazuist-version': process.env.GIT_COMMIT ?? 'unknown' },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The nonce based CSP (src/proxy.ts) needs every page rendered per request: a prerendered page has no nonce.
  await connection();
  return (
    <html lang="tr">
      <head>
        {/* Only first-screen faces are preloaded (wt.121). */}
        <link rel="preload" href="/fonts/SourceSerif4.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/KzSans.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <Kabuk>{children}</Kabuk>
      </body>
    </html>
  );
}
