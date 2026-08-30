'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { DashboardSkeleton } from '@/components/shared/DashboardSkeleton';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/apiClient';
import { useGlobalNavigationShortcuts } from '@/hooks/useGlobalNavigationShortcuts';
import { ShortcutHelpModal } from '@/components/shared/ShortcutHelpModal';
import { GlobalOverlays } from '@/components/shared/GlobalOverlays';
import { cn } from '@/lib/utils';
import { GSTPeriodSelector } from '@/components/gst/GSTPeriodSelector';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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

    const { isHelpOpen, setIsHelpOpen } = useGlobalNavigationShortcuts();
    const pathname = usePathname();
    
    if (!_hasHydrated || !isAuthenticated) {
        return <DashboardSkeleton />;
    }

    const tabs = [
        { name: 'Overview', href: '/gst' },
        { name: 'GSTR-1', href: '/gst/gstr1' },
        { name: 'GSTR-3B', href: '/gst/gstr3b' },
        { name: 'GSTR-2A', href: '/gst/gstr2a' },
        { name: 'GSTR-2B Recon', href: '/gst/reconciliation' },
        { name: 'Sandbox', href: '/gst/sandbox' },
        { name: 'Export History', href: '/gst/history' }
    ];

    return (
        <div className="min-h-[100dvh] bg-slate-50 relative flex flex-col">
            <OfflineBanner />

            {/* Global Top Navigation */}
            <div className="sticky top-0 z-50 w-full flex flex-col">
                <GlobalNavigation />
            </div>

            {/* Main content area */}
            <div className="flex-1 w-full flex flex-col">
                
                {/* Page Header Container */}
                <div className="bg-white shadow-sm border-b border-slate-200 mt-6 w-full">
                    <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
                        {/* Title */}
                        <div className="pt-8 pb-6 flex items-center justify-between">
                            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">GST - GSTR & Reconciliations</h1>
                            <GSTPeriodSelector />
                        </div>

                        {/* GST Sub-Navigation */}
                        <div className="flex gap-8 overflow-x-auto whitespace-nowrap" role="tablist">
                            {tabs.map(tab => (
                                <a 
                                    key={tab.name}
                                    href={tab.href} 
                                    role="tab"
                                    aria-selected={pathname === tab.href}
                                    className={cn(
                                        "pb-3 px-1 text-sm font-semibold border-b-[3px] transition-colors",
                                        pathname === tab.href 
                                            ? "border-purple-600 text-purple-700" 
                                            : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
                                    )}
                                >
                                    {tab.name}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 sm:p-8 mt-8 print:p-0 print:mt-0">
                    {children}
                </main>
            </div>
            
            <GlobalOverlays />
            <ShortcutHelpModal open={isHelpOpen} onOpenChange={setIsHelpOpen} />
        </div>
    );
}
