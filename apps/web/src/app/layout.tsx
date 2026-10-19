import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@kazuist/ui/tokens.css';

export const metadata: Metadata = {
  title: 'Kazuist',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
