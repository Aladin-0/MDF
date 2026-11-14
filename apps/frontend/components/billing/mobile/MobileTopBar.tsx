'use client';

import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, FileText, Lock, Menu, MoreVertical, Receipt, Trash2, UserX } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Sidebar } from '@/components/shared/Sidebar';
import { useBackToClose } from '@/hooks/useBackToClose';
import { useBillingStore } from '@/store/billingStore';
import { canViewBillingMargins } from '@/lib/access';
import { formatCurrency } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { T } from './theme';
import { BillsSheet, sortedDrafts } from './BillsSheet';
import { SheetShell } from './SheetShell';

type Panel =
    | { kind: 'menu' }
    | { kind: 'saleType' }
    | { kind: 'close' };

const rowClass = 'flex min-h-14 w-full touch-manipulation items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-900 active:bg-slate-100 disabled:opacity-50';

/**
 * Phone top bar (48px): nav drawer, bill switcher chip ("Bill 2 · ₹1,038"), sale type chip and the ⋮ menu.
 * It renders the Bills sheet and the menu sheet (with the sale-type and close-bill confirmations as views inside it).
 * Only one sheet is open at a time.
 */
export function MobileTopBar() {
    const drafts = useBillingStore((s) => s.drafts);
    const activeDraftId = useBillingStore((s) => s.activeDraftId);
    const activeStaff = useBillingStore((s) => s.activeStaff);
    const showMarginInfo = useBillingStore((s) => s.showMarginInfo);
    const getDraftTotals = useBillingStore((s) => s.getDraftTotals);
    const setSaleType = useBillingStore((s) => s.setSaleType);
    const setDraftDocumentMode = useBillingStore((s) => s.setDraftDocumentMode);
    const toggleMarginInfo = useBillingStore((s) => s.toggleMarginInfo);
    const startCounterBill = useBillingStore((s) => s.startCounterBill);
    const setWalkInName = useBillingStore((s) => s.setWalkInName);
    const setIsPinVerified = useBillingStore((s) => s.setIsPinVerified);
    const closeDraft = useBillingStore((s) => s.closeDraft);
    const createDraft = useBillingStore((s) => s.createDraft);

    const [navOpen, setNavOpen] = useState(false);
    const [billsOpen, setBillsOpen] = useState(false);
    const [panel, setPanel] = useState<Panel | null>(null);
    useBackToClose(navOpen, () => setNavOpen(false));

    const draft = activeDraftId ? drafts[activeDraftId] : null;
    if (!draft || !activeDraftId) return null;

    const list = sortedDrafts(drafts);
    const billNo = list.findIndex((d) => d.id === draft.id) + 1;
    const total = getDraftTotals(draft.id).grandTotal;
    const wholesale = draft.saleType === 'WHOLESALE';
    const fromQuotation = !!draft.quotationId;       // a bill made from a quotation keeps its mode and type
    const isQuotation = draft.documentMode === 'quotation';
    const canSeeMargins = canViewBillingMargins(activeStaff?.role);
    const itemCount = draft.cart.length;

    const closePanel = () => setPanel(null);
    const targetType = wholesale ? 'RETAIL' : 'WHOLESALE';

    const closeThisBill = () => {
        const onlyBill = list.length <= 1;
        closeDraft(draft.id);
        if (onlyBill) createDraft();          // there is always one bill on screen
        closePanel();
    };

    const requestClose = () => {
        if (itemCount > 0) setPanel({ kind: 'close' });
        else closeThisBill();
    };

    let sheetTitle = 'Bill options';
    let sheetDescription: string | undefined;
    let sheetBody: React.ReactNode = null;
    let sheetFooter: React.ReactNode = undefined;

    if (panel?.kind === 'saleType') {
        const toWholesale = targetType === 'WHOLESALE';
        sheetTitle = toWholesale ? 'Switch to Wholesale?' : 'Switch to Retail?';
        sheetDescription = 'Check this before you continue.';
        sheetBody = toWholesale ? (
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-800">
                <li>The cart is re-priced at PTR / PTS rates, with GST added on top.</li>
                <li>Wholesale bills go to one named customer and are credit sales.</li>
                <li>The person picked in <b>Billing for</b> is cleared.</li>
            </ul>
        ) : (
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-800">
                <li>The cart is re-priced at MRP.</li>
                <li>Retail bills can be for a walk-in, a counter bill or a family member.</li>
            </ul>
        );
        sheetFooter = (
            <div className="flex flex-col gap-2">
                <Button className={cn(T.cta, 'h-12 w-full text-base hover:bg-sky-600')} onClick={() => { setSaleType(draft.id, targetType); closePanel(); }}>
                    Switch to {toWholesale ? 'Wholesale' : 'Retail'}
                </Button>
                <Button variant="outline" className={cn(T.btn, 'h-12 w-full text-base')} onClick={closePanel}>Cancel</Button>
            </div>
        );
    } else if (panel?.kind === 'close') {
        sheetTitle = 'Close this bill?';
        sheetDescription = `${itemCount} item${itemCount === 1 ? '' : 's'} (${formatCurrency(total)}) will be discarded.`;
        sheetBody = <p className="text-sm text-slate-700">Closing removes this bill from this phone. A bill that was never saved cannot be brought back.</p>;
        sheetFooter = (
            <div className="flex flex-col gap-2">
                <Button variant="outline" className="h-12 w-full rounded-xl border-2 border-red-600 bg-white text-base font-bold text-red-700 hover:bg-red-50 hover:text-red-800 active:bg-red-50" onClick={closeThisBill}>Close bill</Button>
                <Button variant="outline" className={cn(T.btn, 'h-12 w-full text-base')} onClick={closePanel}>Keep bill</Button>
            </div>
        );
    } else if (panel?.kind === 'menu') {
        sheetDescription = `Bill ${billNo} · ${wholesale ? 'Wholesale' : 'Retail'} · ${isQuotation ? 'Quotation' : 'Invoice'}`;
        sheetBody = (
            <div className="space-y-1" role="menu" aria-label="Bill options">
                <button
                    type="button" role="menuitem" className={rowClass} disabled={fromQuotation}
                    onClick={() => { setDraftDocumentMode(draft.id, isQuotation ? 'invoice' : 'quotation'); closePanel(); }}
                >
                    <FileText className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                    <span className="min-w-0 flex-1">
                        {isQuotation ? 'Switch to Invoice' : 'Switch to Quotation'}
                        <span className="block text-xs font-medium text-slate-600">
                            {fromQuotation ? 'Not available: this bill came from a quotation' : `Now: ${isQuotation ? 'Quotation (no payment)' : 'Invoice'}`}
                        </span>
                    </span>
                </button>

                {canSeeMargins && (
                    <button type="button" role="menuitemcheckbox" aria-checked={showMarginInfo} className={rowClass} onClick={toggleMarginInfo}>
                        {showMarginInfo ? <Eye className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden /> : <EyeOff className="h-5 w-5 shrink-0 text-slate-700" aria-hidden />}
                        <span className="min-w-0 flex-1">Margin view</span>
                        <span className={cn('rounded px-2 py-0.5 text-xs font-bold', showMarginInfo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700')}>{showMarginInfo ? 'On' : 'Off'}</span>
                    </button>
                )}

                {!wholesale && (
                    <>
                        <button type="button" role="menuitem" data-testid="menu-counter-bill" className={rowClass} onClick={() => { startCounterBill(); closePanel(); }}>
                            <Receipt className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
                            <span className="min-w-0 flex-1">Counter bill
                                <span className="block text-xs font-medium text-slate-600">Cash sale with no customer, person or name</span>
                            </span>
                        </button>
                    </>
                )}

                <button type="button" role="menuitem" className={rowClass} onClick={() => { setIsPinVerified(false); closePanel(); }}>
                    <Lock className="h-5 w-5 shrink-0 text-indigo-700" aria-hidden />
                    <span className="min-w-0 flex-1">Lock terminal
                        <span className="block text-xs font-medium text-slate-600">{activeStaff?.name ? `Signed in as ${activeStaff.name}. ` : ''}Back to the PIN screen</span>
                    </span>
                </button>

                <button type="button" role="menuitem" className={cn(rowClass, 'text-red-700')} onClick={requestClose}>
                    <Trash2 className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">Close this bill
                        <span className="block text-xs font-medium text-slate-600">
                            {itemCount > 0 ? 'Asks first, it has items' : list.length <= 1 ? 'A new empty bill opens' : 'Removes it from the open bills'}
                        </span>
                    </span>
                </button>
            </div>
        );
    }

    return (
        <>
            <header className="flex h-12 shrink-0 items-end gap-2 border-b border-slate-300 bg-[#F1F5F9] px-2">
                <button
                    type="button"
                    aria-label="Open menu"
                    onClick={() => setNavOpen(true)}
                    className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center self-center rounded-lg text-slate-800 active:bg-slate-200"
                >
                    <Menu className="h-5 w-5" aria-hidden />
                </button>

                <button
                    type="button"
                    aria-label={`Open bills. Current bill ${billNo}, ${formatCurrency(total)}`}
                    onClick={() => setBillsOpen(true)}
                    className="flex h-11 min-w-0 flex-1 touch-manipulation items-center justify-center gap-1.5 self-end rounded-t-lg border border-b-0 border-t-[3px] border-slate-300 border-t-blue-600 bg-white px-3 text-sm font-bold text-slate-900 active:bg-slate-50"
                >
                    <span className="truncate tabular-nums">Bill {billNo} · {formatCurrency(total)}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-700" aria-hidden />
                </button>

                <button
                    type="button"
                    aria-label={`Sale type ${wholesale ? 'Wholesale' : 'Retail'}${fromQuotation ? ', locked because this bill came from a quotation' : ', tap to change'}`}
                    disabled={fromQuotation}
                    onClick={() => setPanel({ kind: 'saleType' })}
                    className={cn(
                        'flex h-11 shrink-0 touch-manipulation items-center gap-1 self-center rounded-full border border-sky-300 bg-sky-100 px-3.5 text-sm font-bold text-sky-900 active:bg-sky-200 disabled:opacity-60',
                        wholesale && 'border-sky-700 bg-sky-800 text-white active:bg-sky-900',
                    )}
                >
                    {wholesale ? 'Wholesale' : 'Retail'}
                    {!fromQuotation && <ChevronDown className="h-4 w-4" aria-hidden />}
                </button>

                <button
                    type="button"
                    aria-label="Bill options"
                    aria-haspopup="menu"
                    onClick={() => setPanel({ kind: 'menu' })}
                    className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center self-center rounded-lg text-slate-800 active:bg-slate-200"
                >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                </button>
            </header>

            <Sheet open={navOpen} onOpenChange={setNavOpen}>
                {/* no auto-focus: it would land on the search box and raise the keyboard over the list */}
                <SheetContent side="left" className="z-[70] w-[88vw] max-w-[340px] border-r-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                    <SheetTitle className="sr-only">Menu</SheetTitle>
                    <SheetDescription className="sr-only">Go to another page</SheetDescription>
                    <Sidebar isCollapsed={false} onToggle={() => setNavOpen(false)} isMobile={true} replaceHistory />
                </SheetContent>
            </Sheet>

            <BillsSheet open={billsOpen} onClose={() => setBillsOpen(false)} />

            <SheetShell
                open={panel !== null}
                onClose={closePanel}
                title={sheetTitle}
                description={sheetDescription}
                footer={sheetFooter}
            >
                {sheetBody}
            </SheetShell>

        </>
    );
}
