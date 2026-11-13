'use client';

import { useEffect, useState } from 'react';
import { Search, ScanLine, FileText } from 'lucide-react';
import { useBillingStore } from '@/store/billingStore';
import { useCheckout } from '@/hooks/useCheckout';
import { MobileTopBar } from './MobileTopBar';
import { MobileBanners } from './MobileBanners';
import { PartyChips } from './PartyChips';
import { CartList } from './CartList';
import { SummaryBar } from './SummaryBar';
import { TotalsSheet } from './TotalsSheet';
import { MobileSearch } from './MobileSearch';
import { PaymentView } from './PaymentView';
import { RevisionReasonSheet } from './RevisionReasonSheet';
import { CustomerSheet } from './CustomerSheet';
import { DoctorSheet } from './DoctorSheet';
import { getCollectState } from './collectState';
import { T } from './theme';
import { cn } from '@/lib/utils';
import { useIsOnline } from '@/hooks/useIsOnline';

/**
 * The phone layout of the billing screen (docs/MOBILE_BILLING_DESIGN.md). Rendered by app/billing/page.tsx below 768px, after the PIN
 * gate. It owns no billing logic: totals, GST, checkout and the payload all come from the same store and hooks as the desktop screen.
 *
 *   top bar (bills, retail/wholesale, menu) -> banners -> party chips -> search bar -> cart cards
 *   pinned bottom bar (NET PAYABLE + main button)    sheets: search, totals, payment, customer / doctor (fix-it targets)
 */
export function MobileBilling() {
    const { drafts, activeDraftId, getDraftTotals, landingCostIncludeGst, setDraftDocumentMode, setPayment, setRevisionContext } = useBillingStore();
    const checkout = useCheckout();
    const isOnline = useIsOnline();

    const [searchOpen, setSearchOpen] = useState(false);
    const [totalsOpen, setTotalsOpen] = useState(false);
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [fixTarget, setFixTarget] = useState<'doctor' | 'customer' | null>(null);

    const draft = activeDraftId ? drafts[activeDraftId] : null;
    const totals = activeDraftId ? getDraftTotals(activeDraftId) : null;
    const collect = getCollectState({ draft, totals, checkout, isOnline, landingCostIncludeGst });

    // A wholesale bill is always on credit (same rule as the desktop rail): set it here so the bar's checks and the save agree
    const wholesaleOnCredit = draft?.saleType === 'WHOLESALE' && draft?.documentMode !== 'quotation';
    const paymentMethod = draft?.payment?.method;
    useEffect(() => {
        if (wholesaleOnCredit && paymentMethod !== 'credit') setPayment({ method: 'credit' });
    }, [wholesaleOnCredit, paymentMethod, setPayment]);

    const onCollect = () => {
        // retail: ask how the customer pays (one tap there saves the bill). Quotation / wholesale / edit: nothing to ask, save now.
        if (collect.needsPaymentStep) setPaymentOpen(true);
        else void checkout.handleCheckout();
    };

    // "Fix it" taps on the payment checks: leave the payment step and open the place where the problem is fixed
    const onFix = (target: 'doctor' | 'customer' | 'cart') => {
        setPaymentOpen(false);
        if (target === 'doctor' || target === 'customer') setFixTarget(target);
    };

    if (!activeDraftId || !draft) return null;
    const canConvert = draft.documentMode === 'quotation' && Boolean(draft.quotationId);

    return (
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-100 touch-manipulation">
            <MobileTopBar />
            <MobileBanners />
            <PartyChips />

            {canConvert && (
                <div className="shrink-0 px-3 pt-2">
                    <button
                        type="button"
                        data-testid="convert-to-invoice"
                        onClick={() => setDraftDocumentMode(activeDraftId, 'invoice')}
                        className={cn(T.ctaOutline, 'flex min-h-[44px] w-full touch-manipulation items-center justify-center gap-2 text-sm')}
                    >
                        <FileText className="h-4 w-4" /> Convert to invoice
                    </button>
                </div>
            )}

            {/* the search bar: a big tap target that opens the full-screen search */}
            <div className="shrink-0 px-3 pb-2 pt-2">
                <button
                    type="button"
                    data-testid="mobile-search-open"
                    onClick={() => setSearchOpen(true)}
                    className="flex h-12 w-full touch-manipulation items-center gap-3 rounded-lg border-2 border-sky-500 bg-white px-3 text-left text-sm font-semibold text-slate-600 shadow-[0_2px_8px_rgba(14,165,233,0.25)] active:bg-sky-50"
                >
                    <Search className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">Search medicine…</span>
                    <ScanLine className="h-5 w-5 shrink-0 text-sky-600" aria-label="Scan a barcode" />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <CartList />
            </div>

            <SummaryBar
                label={collect.label}
                disabledReason={collect.disabledReason}
                submitting={checkout.isLoading}
                onCollect={onCollect}
                onOpenTotals={() => setTotalsOpen(true)}
            />

            <MobileSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
            <TotalsSheet open={totalsOpen} onClose={() => setTotalsOpen(false)} />
            <PaymentView open={paymentOpen} onClose={() => setPaymentOpen(false)} checkout={checkout} onFix={onFix} />
            <RevisionReasonSheet
                open={checkout.reasonModalOpen}
                onClose={() => checkout.setReasonModalOpen(false)}
                onSubmit={(code, text) => {
                    // Same steps as the desktop rail: store the reason on the draft, close, then save (the store updates synchronously)
                    setRevisionContext(draft?.revisionAction || null, code, text);
                    checkout.setReasonModalOpen(false);
                    checkout.executeCheckout();
                }}
            />
            <CustomerSheet open={fixTarget === 'customer'} onClose={() => setFixTarget(null)} />
            <DoctorSheet open={fixTarget === 'doctor'} onClose={() => setFixTarget(null)} />
        </div>
    );
}
