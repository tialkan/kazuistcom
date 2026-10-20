import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@kazuist/ui/tokens.css';
import '@kazuist/ui/fonts.css';
import '@kazuist/ui/components.css';
import { Kabuk } from './(kabuk)/_kabuk/Kabuk.tsx';

export const metadata: Metadata = {
  title: 'Kazuist',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
