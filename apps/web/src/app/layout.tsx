import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TenderFlow - Professional Tender Management',
  description: 'Streamline your tender management process with advanced automation, validation, and collaboration tools.',
  keywords: ['tender management', 'procurement', 'bid management', 'business automation'],
  authors: [{ name: 'TenderFlow Team' }],
  viewport: 'width=device-width, initial-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}