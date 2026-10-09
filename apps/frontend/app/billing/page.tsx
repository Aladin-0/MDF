'use client';

import { BillingHeaderStrip } from '@/components/billing/BillingHeaderStrip';
import { MainInvoiceWorkspace } from '@/components/billing/MainInvoiceWorkspace';
import { RightBillingRail } from '@/components/billing/RightBillingRail';
import { ActiveBillsTabs } from '@/components/billing/ActiveBillsTabs';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';
import { TransactionStrip } from '@/components/billing/TransactionStrip';
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
    useAutosaveDraft();
    const draftsLoaded = useLoadDrafts();
    const [showInvoicePreview, setShowInvoicePreview] = useState(false);
    const toggleMarginInfo = useBillingStore(s => s.toggleMarginInfo);

    // Refs for enter navigation
    const customerRef = useRef<HTMLInputElement>(null);
    const doctorRef = useRef<HTMLInputElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    useEnterNavigation([customerRef, doctorRef, searchRef]);

    // Strict Header-First Initial Focus
    useEffect(() => {
        if (!draftsLoaded || !activeDraftId) return;
        
        // Timeout to allow DOM refs to attach
        const timer = setTimeout(() => {
            if (customerRef.current) {
                // customerRef is now bound directly to the input, not a wrapper div
                customerRef.current.focus();
            }
        }, 50);

        return () => clearTimeout(timer);
    }, [draftsLoaded, activeDraftId]); // Only run on load or draft switch

    // Global Keyboard Shortcuts
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            // Ctrl+M to toggle margin view
            if (e.ctrlKey && e.key.toLowerCase() === 'm') {
                e.preventDefault();
                toggleMarginInfo();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [toggleMarginInfo]);

    if (!isPinVerified) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-slate-100">
                <StaffPinEntry />
            </div>
        );
    }

    if (!draftsLoaded) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500 font-medium">
                Loading drafts...
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
            {/* Transaction Strip */}
            <TransactionStrip />

            {/* Active Drafts Tabs */}
            <ActiveBillsTabs />

            {/* Main Workspace (Split Left/Right) */}
            <div className="flex flex-row flex-1 overflow-auto">
                {/* Left Area: Context & Workspace */}
                <div className="flex-1 w-full flex flex-col min-h-[500px] min-w-0">
                    {/* V3 Header Strip (Context Band) */}
                    {activeDraftId && <BillingHeaderStrip key={`header-${activeDraftId}`} customerRef={customerRef} doctorRef={doctorRef} medicineSearchRef={searchRef} />}
                    
                    {/* Invoice Table Workspace */}
                    {activeDraftId && <MainInvoiceWorkspace key={`workspace-${activeDraftId}`} searchRef={searchRef} />}
                </div>

                {/* Right Area: Payment Dock */}
                <div className="w-[300px] lg:w-[400px] shrink-0 border-l">
                    {activeDraftId && <RightBillingRail key={`rail-${activeDraftId}`} />}
                </div>
            </div>
            
            <InvoicePreviewModal
                isOpen={showInvoicePreview}
                onClose={() => setShowInvoicePreview(false)}
                invoice={lastInvoice as any}
                onNewBill={() => setLastInvoice(null)}
            />
        </div>
    );
}
