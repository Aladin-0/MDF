'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';
import { SmartCheckInBanner } from '@/components/attendance/SmartCheckInBanner';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { useAuthGate } from '@/hooks/useAuthGate';
import { RouteGuard } from '@/components/shared/RouteGuard';
import { GlobalOverlays } from '@/components/shared/GlobalOverlays';
import { cn } from '@/lib/utils';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {

    // login redirect (one shared implementation); keeping the user fresh is <SessionSync/>'s job
    const ready = useAuthGate();

    // The pinned top bar (navigation + check-in banner) changes height when the banner goes away. Publish the height as --app-header-h so a
    // page can pin something just below it (e.g. the New Purchase column header: `sticky top-[var(--app-header-h,0px)]`).
    const headerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = headerRef.current;
        if (!el) return;
        const set = () => document.documentElement.style.setProperty('--app-header-h', `${Math.round(el.getBoundingClientRect().height)}px`);
        set();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(set);
        ro.observe(el);
        return () => { ro.disconnect(); document.documentElement.style.removeProperty('--app-header-h'); };
    }, [ready]);

    if (!ready) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="min-h-[100dvh] bg-slate-50 relative flex flex-col">
            <OfflineBanner />

            {/* Global Top Navigation */}
            <div ref={headerRef} className="sticky top-0 z-50 w-full flex flex-col">
                <GlobalNavigation />
                <SmartCheckInBanner />
            </div>

            {/* Main content area */}
            <div className="flex-1 w-full max-w-[1800px] mx-auto overflow-x-clip flex flex-col">
                <main className="flex-1 p-3 sm:p-6 print:p-0">
                    <RouteGuard>{children}</RouteGuard>
                </main>
            </div>
            
            <GlobalOverlays />
        </div>
    );
}
