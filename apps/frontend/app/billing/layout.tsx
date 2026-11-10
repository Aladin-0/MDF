'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { useAuthStore } from '@/store/authStore';
import { useAuthGate } from '@/hooks/useAuthGate';
import { RouteGuard } from '@/components/shared/RouteGuard';
import { GlobalOverlays } from '@/components/shared/GlobalOverlays';


export default function BillingLayout({ children }: { children: React.ReactNode }) {

    // login redirect (one shared implementation); keeping the user fresh is <SessionSync/>'s job
    const ready = useAuthGate();


    if (!ready) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="h-screen w-screen bg-slate-50 relative overflow-hidden flex flex-col">
            <OfflineBanner />
            {/* Main Full-Screen Content */}
            <main className="flex-1 h-full w-full overflow-hidden flex flex-col">
                <RouteGuard>{children}</RouteGuard>
            </main>
            <GlobalOverlays />
        </div>
    );
}
