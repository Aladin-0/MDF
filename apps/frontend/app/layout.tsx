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
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'MediFlow',
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
