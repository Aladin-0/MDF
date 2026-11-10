'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';
import { useAuthStore } from '@/store/authStore';
import { useAuthGate } from '@/hooks/useAuthGate';
import { RouteGuard } from '@/components/shared/RouteGuard';

import { GlobalOverlays } from '@/components/shared/GlobalOverlays';
import { cn } from '@/lib/utils';

export default function AdminLayout({ children }: { children: React.ReactNode }) {

    // login redirect (one shared implementation); keeping the user fresh is <SessionSync/>'s job
    const ready = useAuthGate();

    if (!ready) {
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
                    <RouteGuard>{children}</RouteGuard>
                </main>
            </div>
            
            <GlobalOverlays />
        </div>
    );
}
