import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/ui/toaster';
import { CommandMenu } from '@/components/shared/CommandMenu';
import { GlobalModalManager } from '@/components/shared/GlobalModalManager';



export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: '#ffffff',
};

export const metadata: Metadata = {
    title: 'MediFlow — Modern Pharmacy Management',
    description: 'Fast, reliable, and compliant pharmacy management software for India.',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'MediFlow',
    },
    other: {
        'mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-status-bar-style': 'black-translucent',
    },
    formatDetection: {
        telephone: false,
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link rel="manifest" href="/manifest.json" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="theme-color" content="#ffffff" />
            </head>
            <body className="font-sans antialiased">
                <ErrorBoundary>
                    <Providers>{children}</Providers>
                    <Toaster />
                    <CommandMenu />
                    <GlobalModalManager />
                </ErrorBoundary>
            </body>
        </html>
    );
}
