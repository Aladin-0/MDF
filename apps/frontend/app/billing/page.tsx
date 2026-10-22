'use client';

import { BillingHeaderStrip } from '@/components/billing/BillingHeaderStrip';
import { MainInvoiceWorkspace } from '@/components/billing/MainInvoiceWorkspace';
import { RightBillingRail } from '@/components/billing/RightBillingRail';
import { ActiveBillsTabs } from '@/components/billing/ActiveBillsTabs';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';
import { useBillingStore } from '@/store/billingStore';
import { StaffPinEntry } from '@/components/billing/StaffPinEntry';
import { useAutosaveDraft } from '@/hooks/useAutosaveDraft';
import { useLoadDrafts } from '@/hooks/useLoadDrafts';
import { BillSuccessScreen } from '@/components/billing/BillSuccessScreen';
import { InvoicePreviewModal } from '@/components/billing/InvoicePreviewModal';
import { useState, useEffect, Suspense, useRef } from 'react';
import { EditSaleHydrator } from '@/components/billing/EditSaleHydrator';
import { useEnterNavigation } from '@/hooks/useEnterNavigation';

export default function FullScreenBillingPage() {
    const { isPinVerified, activeDraftId, lastInvoice, setLastInvoice, drafts } = useBillingStore();
    const hasHydrated = useBillingStore(state => state._hasHydrated);
    useAutosaveDraft();
    const draftsLoaded = useLoadDrafts();
    const [showInvoicePreview, setShowInvoicePreview] = useState(false);
    const toggleMarginInfo = useBillingStore(s => s.toggleMarginInfo);

    // Ensure billing store finishes rehydration on mount
    useEffect(() => {
        if (!useBillingStore.getState()._hasHydrated) {
            useBillingStore.persist?.rehydrate?.();
            useBillingStore.getState().setHasHydrated(true);
        }
    }, []);

    // Refs for enter navigation
    const customerRef = useRef<HTMLInputElement>(null);
    const doctorRef = useRef<HTMLInputElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    useEnterNavigation([customerRef, doctorRef, searchRef]);

    // Strict Header-First Initial Focus (only on initial load or explicit tab switch)
    const lastSessionRef = useRef<string | null>(null);
    useEffect(() => {
        if (!hasHydrated || !draftsLoaded || !activeDraftId) return;
        const currentSession = drafts[activeDraftId]?.localSessionId || activeDraftId;
        
        // Prevent re-focusing if the draft ID simply mutated (e.g. autosaved from local- to server-uuid)
        if (lastSessionRef.current === currentSession) return;
        lastSessionRef.current = currentSession;

        // If the user is already interacting with an input (e.g. medicine search), do NOT yank focus away!
        if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            return;
        }
        
        // Timeout to allow DOM refs to attach
        const timer = setTimeout(() => {
            if (customerRef.current) {
                // customerRef is now bound directly to the input, not a wrapper div
                customerRef.current.focus();
            }
        }, 50);

        return () => clearTimeout(timer);
    }, [hasHydrated, draftsLoaded, activeDraftId, drafts]);

    // Global Keyboard Shortcuts
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            // Prevent toggle if user is typing in an input, textarea, or select
            const target = e.target as HTMLElement;
            const activeEl = document.activeElement as HTMLElement;
            const isTyping = (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) ||
                             (activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName));
            if (isTyping) {
                return;
            }

            // Ctrl+Shift+M or Ctrl+M to toggle margin view
            if (e.ctrlKey && e.key.toLowerCase() === 'm') {
                e.preventDefault();
                toggleMarginInfo();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [toggleMarginInfo]);

    if (!hasHydrated || !draftsLoaded) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500 font-medium">
                Loading drafts...
            </div>
        );
    }

    if (!isPinVerified) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-slate-100">
                <StaffPinEntry />
            </div>
        );
    }

    if (lastInvoice && !showInvoicePreview) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
                <BillSuccessScreen
                    invoice={lastInvoice}
                    onNewBill={() => setLastInvoice(null)}
                    onPrint={() => {
                        setShowInvoicePreview(true);
                    }}
                    onViewInvoice={() => {
                        setShowInvoicePreview(true);
                    }}
                />
            </div>
        );
    }

    return (
        <div ref={pageRef} className="h-[100dvh] w-screen overflow-hidden flex flex-col bg-[#F8FAFC] font-sans">
            <Suspense fallback={null}>
                <EditSaleHydrator />
            </Suspense>
            {/* Global Top Navigation */}
            <div className="sticky top-0 z-50 w-full flex flex-col shrink-0">
                <GlobalNavigation />
            </div>
            {/* Unified Active Drafts & Session Strip */}
            <ActiveBillsTabs />

            {/* Main Workspace (Split Left/Right) */}
            {(() => {
                const activeDraft = activeDraftId ? drafts[activeDraftId] : null;
                const sessionKey = activeDraft?.localSessionId || activeDraftId;
                return (
                    <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
                        {/* Left Area: Context & Workspace */}
                        <div className="flex-1 w-full flex flex-col min-w-0 min-h-0">
                            {/* V3 Header Strip (Context Band) */}
                            {activeDraftId && <BillingHeaderStrip key={`header-${sessionKey}`} customerRef={customerRef} doctorRef={doctorRef} medicineSearchRef={searchRef} />}
                            
                            {/* Invoice Table Workspace */}
                            {activeDraftId && <MainInvoiceWorkspace key={`workspace-${sessionKey}`} searchRef={searchRef} />}
                        </div>

                        {/* Right Area: Payment Dock */}
                        <div className="w-full lg:w-[360px] xl:w-[400px] shrink-0 border-t-0 lg:border-l">
                            {activeDraftId && <RightBillingRail key={`rail-${sessionKey}`} />}
                        </div>
                    </div>
                );
            })()}
            
            <InvoicePreviewModal
                isOpen={showInvoicePreview}
                onClose={() => setShowInvoicePreview(false)}
                invoice={lastInvoice as any}
                onNewBill={() => setLastInvoice(null)}
            />
        </div>
    );
}
