'use client';

import { BillingHeaderStrip } from '@/components/billing-v3/BillingHeaderStrip';
import { MainInvoiceWorkspace } from '@/components/billing-v3/MainInvoiceWorkspace';
import { RightBillingRail } from '@/components/billing-v3/RightBillingRail';
import { ActiveBillsTabs } from '@/components/billing-v3/ActiveBillsTabs';
import { GlobalNavigation } from '@/components/layout/GlobalNavigation';
import { TransactionStrip } from '@/components/billing-v3/TransactionStrip';
import { useBillingStore } from '@/store/billingStore';
import { StaffPinEntry } from '@/components/billing/StaffPinEntry';
import { useAutosaveDraft } from '@/hooks/useAutosaveDraft';
import { useLoadDrafts } from '@/hooks/useLoadDrafts';
import { BillSuccessScreen } from '@/components/billing/BillSuccessScreen';
import { InvoicePreviewModal } from '@/components/billing/InvoicePreviewModal';
import { useState } from 'react';

export default function FullScreenBillingPage() {
    const { isPinVerified, activeDraftId, lastInvoice, setLastInvoice } = useBillingStore();
    useAutosaveDraft();
    const draftsLoaded = useLoadDrafts();
    const [showInvoicePreview, setShowInvoicePreview] = useState(false);

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
                    onPrint={() => setShowInvoicePreview(true)}
                    onViewInvoice={() => setShowInvoicePreview(true)}
                />
            </div>
        );
    }

    return (
        <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#F8FAFC] font-sans">
            {/* Global Top Navigation */}
            <div className="sticky top-0 z-50 w-full flex flex-col shrink-0">
                <GlobalNavigation />
            </div>
            {/* Transaction Strip */}
            <TransactionStrip />

            {/* Active Drafts Tabs */}
            <ActiveBillsTabs />

            {/* Main Workspace (Split Left/Right) */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Area: Context & Workspace */}
                <div className="flex-1 min-w-[600px] flex flex-col">
                    {/* V3 Header Strip (Context Band) */}
                    {activeDraftId && <BillingHeaderStrip key={`header-${activeDraftId}`} />}
                    
                    {/* Invoice Table Workspace */}
                    {activeDraftId && <MainInvoiceWorkspace key={`workspace-${activeDraftId}`} />}
                </div>

                {/* Right Area: Payment Dock */}
                <div className="w-[400px] shrink-0">
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
