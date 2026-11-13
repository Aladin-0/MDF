'use client';

import { useEffect, useRef, useState } from 'react';
import { PackagePlus, Plus, Save } from 'lucide-react';
import type { PurchaseInvoiceFull } from '@/types';
import { cn } from '@/lib/utils';
import { T } from '@/components/billing/mobile/theme';
import { usePurchaseEntry } from '@/hooks/usePurchaseEntry';
import { useIsOnline } from '@/hooks/useIsOnline';
import { getPurchaseChecks, type CheckFix } from '@/lib/purchaseChecks';
import { isStartedLine } from '@/lib/purchaseLine';
import { AddNewProductDrawer } from '../AddNewProductDrawer';
import { LeavePurchaseDialog } from '../LeavePurchaseDialog';
import { PackSizeConfirmDialog } from '../PackSizeConfirmDialog';
import { PurchaseHeaderCard } from './PurchaseHeaderCard';
import { PurchaseDetailsSheet } from './PurchaseDetailsSheet';
import { PurchaseLineCard } from './PurchaseLineCard';
import { PurchaseLineSheet } from './PurchaseLineSheet';
import { PurchaseTotalsSheet } from './PurchaseTotalsSheet';
import { PurchaseSummaryBar } from './PurchaseSummaryBar';
import { PurchaseBanners } from './PurchaseBanners';
import { PurchaseRevisionSheet } from './PurchaseRevisionSheet';

interface MobilePurchaseProps {
    onSuccess: (updatedInvoiceId?: string) => void;
    invoiceToEdit?: PurchaseInvoiceFull | null;
}

/**
 * The New Purchase screen on a phone (below 768px; tablets and desktop keep the grid in NewPurchaseForm). It shows the same purchase
 * (`usePurchaseEntry`) as cards and sheets: header card, one card per medicine (tap to edit in a sheet), a pinned bar with the net payable and Save.
 * It holds no purchase rules of its own.
 */
export function MobilePurchase({ onSuccess, invoiceToEdit }: MobilePurchaseProps) {
    const entry = usePurchaseEntry({ onSuccess, invoiceToEdit });
    const {
        items, watch, isDuplicate, isSubmitting, netPayable, totalUnits, handleAddItem, saveDraft, drawerOpen, setDrawerOpen, drawerInitialName, handleProductCreated,
        revisionReasonCode, revisionReasonText, setRevisionReasonCode, setRevisionReasonText, cleanItemsBeforeSubmit, handleSubmit, onSubmit, onInvalid,
        hasUnsavedWork, discardDraft, packConfirm, confirmPackSizes, pkgServerIssue,
    } = entry;
    const isOnline = useIsOnline();

    const [lineIndex, setLineIndex] = useState<number | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [totalsOpen, setTotalsOpen] = useState(false);
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [saveAfterReason, setSaveAfterReason] = useState(false);
    const [leaveOpen, setLeaveOpen] = useState(false);
    const partyBoxRef = useRef<HTMLDivElement>(null);
    const invoiceRef = useRef<HTMLInputElement>(null);

    const isEdit = !!invoiceToEdit && invoiceToEdit.status !== 'SAVED';
    // Cancel with typed-in work asks first (a mis-tap must not throw away a long bill)
    // the server refused a line's pack size: open that line (its PKG box shows why)
    useEffect(() => { if (pkgServerIssue) setLineIndex(pkgServerIssue.index); }, [pkgServerIssue]);

    const requestLeave = () => { if (hasUnsavedWork) setLeaveOpen(true); else onSuccess(); };
    const started = items.map((it, index) => ({ it, index })).filter(({ it }) => isStartedLine(it));
    const checks = getPurchaseChecks({ partyLedgerId: watch('partyLedgerId'), invoiceNo: watch('invoiceNo'), isDuplicate: !!isDuplicate, items, isOnline });

    const addMedicine = () => {
        // reuse the spare blank row if there is one, else make a new one (it is dropped again if the sheet is closed empty)
        const blank = items.findIndex((it) => !isStartedLine(it));
        if (blank >= 0) { setLineIndex(blank); return; }
        handleAddItem();
        setLineIndex(items.length);
    };

    const goFix = (fix: CheckFix) => {
        if (!fix) return;
        if (fix.type === 'party') { partyBoxRef.current?.scrollIntoView?.({ block: 'center' }); partyBoxRef.current?.querySelector('input')?.focus(); }
        else if (fix.type === 'invoice') { invoiceRef.current?.scrollIntoView?.({ block: 'center' }); invoiceRef.current?.focus(); }
        else if (fix.type === 'add') addMedicine();
        else setLineIndex(fix.index);
    };

    const doSave = () => {
        if (!cleanItemsBeforeSubmit()) return;
        void handleSubmit(onSubmit, onInvalid)();
    };
    const onSave = () => { if (isEdit) setRevisionOpen(true); else doSave(); };

    // The reason is stored in state first; the save runs on the next render so it sees it (the form reads it through its render)
    useEffect(() => {
        if (saveAfterReason && revisionReasonCode && revisionReasonText.trim().length >= 10) {
            setSaveAfterReason(false);
            setRevisionOpen(false);
            doSave();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saveAfterReason, revisionReasonCode, revisionReasonText]);

    return (
        <div data-testid="mobile-purchase" className="touch-manipulation space-y-3 pb-[calc(10rem+env(safe-area-inset-bottom))]">
            <PurchaseBanners entry={entry} invoiceToEdit={invoiceToEdit} />
            <PurchaseHeaderCard entry={entry} onOpenDetails={() => setDetailsOpen(true)} partyBoxRef={partyBoxRef} invoiceInputRef={invoiceRef} />

            <section aria-label="Medicines" className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-extrabold text-slate-900">Medicines <span data-testid="medicine-count" className="ml-1 text-sm font-bold text-slate-700">{started.length}</span></h2>
                    {!isEdit && (
                        <button type="button" data-testid="save-draft" onClick={saveDraft} className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-slate-800 active:bg-slate-200">
                            <Save className="h-4 w-4" aria-hidden />Save draft
                        </button>
                    )}
                </div>

                {started.length === 0 ? (
                    <button type="button" data-testid="add-first" onClick={addMedicine}
                        className="flex w-full touch-manipulation flex-col items-center gap-2 rounded-xl border-2 border-dashed border-sky-500 bg-white px-4 py-8 text-center active:bg-sky-50">
                        <PackagePlus className="h-9 w-9 text-sky-600" aria-hidden />
                        <span className="text-lg font-extrabold text-slate-900">Add the first medicine</span>
                        <span className="text-sm font-medium text-slate-700">Search by name, then enter the batch, expiry, quantity and rates.</span>
                    </button>
                ) : (
                    <>
                        <ul className="space-y-2">
                            {started.map(({ it, index }, n) => (
                                <PurchaseLineCard key={index} item={it} number={n + 1} onEdit={() => setLineIndex(index)} />
                            ))}
                        </ul>
                        <button type="button" data-testid="add-medicine" onClick={addMedicine}
                            className={cn(T.ctaOutline, 'flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-2 text-sm')}>
                            <Plus className="h-4 w-4" aria-hidden />Add another medicine
                        </button>
                    </>
                )}
            </section>

            <button type="button" data-testid="cancel-purchase" onClick={requestLeave} className="mx-auto block min-h-[44px] px-4 text-sm font-bold text-slate-700 underline">
                {isEdit ? 'Cancel editing' : 'Cancel'}
            </button>

            <PurchaseSummaryBar
                medicines={started.length}
                units={totalUnits}
                netPayable={netPayable}
                label={isEdit ? 'Update purchase' : 'Save purchase'}
                disabledReason={checks[0]?.reason ?? null}
                onFix={() => goFix(checks[0]?.fix ?? null)}
                submitting={isSubmitting}
                onSave={onSave}
                onOpenTotals={() => setTotalsOpen(true)}
            />

            {/* the add-new-product drawer is an ordinary sheet and would open BEHIND this full-screen one: step aside while it is open (the row is kept) */}
            <PurchaseLineSheet entry={entry} index={drawerOpen ? null : lineIndex} onClose={() => setLineIndex(null)} />
            <PurchaseDetailsSheet entry={entry} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
            <PurchaseTotalsSheet entry={entry} open={totalsOpen} onClose={() => setTotalsOpen(false)} />
            <PurchaseRevisionSheet
                open={revisionOpen}
                onClose={() => { setRevisionOpen(false); setSaveAfterReason(false); }}
                code={revisionReasonCode}
                text={revisionReasonText}
                onCode={setRevisionReasonCode}
                onText={setRevisionReasonText}
                saving={saveAfterReason || isSubmitting}
                onConfirm={() => setSaveAfterReason(true)}
            />
            <PackSizeConfirmDialog
                mismatches={packConfirm}
                onConfirm={confirmPackSizes}
                onReview={(first) => { entry.cancelPackConfirm(); if (first !== undefined) setLineIndex(first); }}
            />
            <LeavePurchaseDialog
                open={leaveOpen}
                onOpenChange={setLeaveOpen}
                canSaveDraft={!isEdit}
                onSaveDraft={() => { saveDraft(); setLeaveOpen(false); onSuccess(); }}
                onDiscard={() => { discardDraft(); setLeaveOpen(false); onSuccess(); }}
            />
            <AddNewProductDrawer open={drawerOpen} onOpenChange={setDrawerOpen} initialName={drawerInitialName} onSuccess={handleProductCreated} />
        </div>
    );
}
