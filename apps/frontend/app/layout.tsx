import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

const inter = Inter({ subsets: ['latin'] });

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
                </ErrorBoundary>
            </body>
        </html>
    );
}
