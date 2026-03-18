import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { AppProvider } from '@/lib/context';
import { ThemeProvider } from 'next-themes';
import ThemeSync from '@/components/ThemeSync';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  title: 'Pivot — Financial Dashboard',
  description: 'Interactive financial dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} antialiased bg-slate-50`}>
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          <AppProvider>
            <ThemeSync />
            {children}
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
