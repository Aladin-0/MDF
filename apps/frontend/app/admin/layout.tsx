'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/apiClient';
import { useGlobalNavigationShortcuts } from '@/hooks/useGlobalNavigationShortcuts';
import { ShortcutHelpModal } from '@/components/shared/ShortcutHelpModal';
import { GlobalOverlays } from '@/components/shared/GlobalOverlays';
import { cn } from '@/lib/utils';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, _hasHydrated } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) {
            router.push('/login');
        } else if (_hasHydrated && isAuthenticated) {
            authApi.me().then(data => {
                if (data && data.user) {
                    useAuthStore.getState().setUser(data.user);
                } else if (data && data.id) {
                    useAuthStore.getState().setUser(data);
                    if (data.outlet) {
                        useAuthStore.getState().setOutlet(data.outlet);
                    }
                }
            }).catch(console.error);
        }
    }, [_hasHydrated, isAuthenticated, router]);

    const { isHelpOpen, setIsHelpOpen } = useGlobalNavigationShortcuts();
    if (!_hasHydrated || !isAuthenticated) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="min-h-[100dvh] bg-slate-50 relative flex flex-col">
            <OfflineBanner />

            {/* Global Top Navigation */}
            <div className="sticky top-0 z-50 w-full flex flex-col">
                <GlobalNavigation />
            </div>

            {/* Main content area */}
            <div className="flex-1 w-full max-w-[1600px] mx-auto overflow-x-hidden flex flex-col">
                <main className="flex-1 p-4 sm:p-6 print:p-0">
                    {children}
                </main>
            </div>
            
            <GlobalOverlays />
            <ShortcutHelpModal open={isHelpOpen} onOpenChange={setIsHelpOpen} />
        </div>
    );
}
