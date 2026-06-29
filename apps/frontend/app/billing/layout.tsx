'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/apiClient';
import { GlobalOverlays } from '@/components/shared/GlobalOverlays';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function BillingLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) {
            router.push('/login');
        } else if (_hasHydrated && isAuthenticated) {
            authApi.me().then(data => {
                if (data && data.id) {
                    useAuthStore.getState().setUser(data);
                    if (data.outlet) {
                        useAuthStore.getState().setOutlet(data.outlet);
                    }
                }
            }).catch(console.error);
        }
    }, [_hasHydrated, isAuthenticated, router]);

    // Shortcuts for the full-screen app wrapper
    useKeyboardShortcuts({
        'Escape': () => { /* Prevent default if needed */ },
        'Ctrl+q': () => router.push('/dashboard') // Quick exit back to dashboard
    });

    if (!_hasHydrated || !isAuthenticated) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="h-screen w-screen bg-slate-50 relative overflow-hidden flex flex-col">
            <OfflineBanner />
            {/* Main Full-Screen Content */}
            <main className="flex-1 h-full w-full overflow-hidden flex flex-col">
                {children}
            </main>
            <GlobalOverlays />
        </div>
    );
}
