import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from 'sonner';
import { GlobalShortcuts } from '@/components/shared/GlobalShortcuts';
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
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="theme-color" content="#ffffff" />
            </head>
            <body className="font-sans antialiased">
                <ErrorBoundary>
                    <Providers>{children}</Providers>
                    <Toaster />
                    {/* 16 files show their messages with `toast` from 'sonner' (staff saves, reports, GST, sales, ...).
                        Nothing used to mount sonner's own Toaster, so those messages were never visible:
                        a save succeeded or failed with no feedback at all. */}
                    <SonnerToaster position="top-right" richColors closeButton />
                    <GlobalShortcuts />
                    <GlobalModalManager />
                </ErrorBoundary>
            </body>
        </html>
    );
}
