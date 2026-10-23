import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase';
import { AppProviders } from '@/components/providers/app-providers';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'ManasMitra - Mental Wellness Companion',
  description: 'Your AI-powered, confidential, and empathetic mental wellness companion for daily check-ins, mindfulness, and emotional support.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ManasMitra',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'ManasMitra',
    title: 'ManasMitra - Mental Wellness Companion',
    description: 'Your AI-powered mental wellness companion',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ManasMitra',
    description: 'Your AI-powered mental wellness companion',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4DB6AC' },
    { media: '(prefers-color-scheme: dark)', color: '#2D3748' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="48x48" href="/favicon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <AppProviders>
            <main id="main-content" tabIndex={-1} className="outline-none min-h-screen">
              {children}
            </main>
            <Toaster />
          </AppProviders>
        </FirebaseClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
