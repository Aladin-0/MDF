'use client';

import { useMagicSubmit } from '@/hooks/useMagicSubmit';
import { useEnterNavigation } from '@/hooks/useEnterNavigation';
import { useGridNavigation } from '@/hooks/useGridNavigation';
import { Plus, AlertTriangle, Save, X, FileText, Calculator, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { LedgerPicker } from '@/components/accounts/LedgerPicker';
import { useState, useEffect } from 'react';
import { PurchaseItemRow, PURCHASE_ITEM_COLS } from './PurchaseItemRow';
import { useShortcutHandler } from '@/hooks/useShortcutHandler';
import { AddNewProductDrawer } from './AddNewProductDrawer';
import type { PurchaseInvoiceFull } from '@/types';
import { usePurchaseEntry } from '@/hooks/usePurchaseEntry';
import { useIsPhone } from '@/hooks/useIsPhone';
import { LeavePurchaseDialog } from './LeavePurchaseDialog';
import { PackSizeConfirmDialog } from './PackSizeConfirmDialog';
import { MobilePurchase } from './mobile/MobilePurchase';
import { GODOWNS, REVISION_REASONS, defaultDueStr, fmt, normalizeExpiry } from '@/lib/purchaseEntry';

export { emptyItem, normalizeExpiry } from '@/lib/purchaseEntry';

const purchaseGridHeaderCell = 'border-r border-b-2 border-[#D8DEE8] border-b-slate-300 bg-slate-100 px-1.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700';

// ─── Component (desktop / tablet grid) ───────────────────────────────────────

interface NewPurchaseFormProps {
    onSuccess: (updatedInvoiceId?: string) => void;
    invoiceToEdit?: PurchaseInvoiceFull | null;
}

function PurchaseGridForm({ onSuccess, invoiceToEdit }: NewPurchaseFormProps) {
    const {
        hasUnsavedWork, discardDraft, packConfirm, confirmPackSizes, cancelPackConfirm,
        adjustmentSign,
        cleanItemsBeforeSubmit,
        computedTotal,
        creditDays,
        dateRef,
        draftKey,
        drawerInitialName,
        drawerOpen,
        errors,
        formRef,
        freight,
        gridContainerRef,
        handleAddItem,
        handleItemChange,
        handleOpenAddProduct,
        handleProductCreated,
        handleRemoveItem,
        handleSelectProduct,
        handleSubmit,
        hasDraft,
        invoiceDiscount,
        invoiceDiscountPct,
        invoiceNoRef,
        isDuplicate,
        isSubmitting,
        items,
        ledgerAdjustment,
        ledgerNote,
        linkedPo,
        loadPo,
        nearExpiryCount,
        netPayable,
        notesRef,
        ocrError,
        ocrNeedsReview,
        ocrReviewNotes,
        ocrStatus,
        onInvalid,
        onSubmit,
        openPos,
        outletId,
        partyLedger,
        partyRef,
        poRef,
        register,
        restoreDraft,
        retryOcr,
        revisionReasonCode,
        revisionReasonText,
        saveDraft,
        scannedImage,
        scannedImageModalOpen,
        scannedPages,
        scannedPageSizes,
        setAdjustmentSign,
        setCreditDays,
        setDrawerOpen,
        setHasDraft,
        setLedgerAdjustment,
        setLedgerNote,
        setLinkedPo,
        setOcrStatus,
        setPartyLedger,
        setRevisionReasonCode,
        setRevisionReasonText,
        setScannedImageModalOpen,
        setValue,
        taxableValue,
        totalCashDisc,
        totalGST,
        totalTradeDisc,
        totalUnits,
        trigger,
        watch,
        watchedPurchaseType,
    } = usePurchaseEntry({ onSuccess, invoiceToEdit });

    const isEditSaved = !!invoiceToEdit && invoiceToEdit.status !== 'SAVED';
    const [leaveOpen, setLeaveOpen] = useState(false);
    // Cancel with typed-in work asks first (a mis-tap must not throw away a long bill)
    const requestLeave = () => { if (hasUnsavedWork) setLeaveOpen(true); else onSuccess(); };

    // The Save / Cancel bar is pinned to the bottom of the window from 1280px: keep toasts above it, not on top of the buttons
    useEffect(() => {
        document.documentElement.setAttribute('data-purchase-footer', 'true');
        return () => document.documentElement.removeAttribute('data-purchase-footer');
    }, []);

    // Keyboard-only helpers of the grid (a phone has no Enter-to-next-cell, no Ctrl shortcuts)
    useEnterNavigation([partyRef, invoiceNoRef, dateRef, poRef, notesRef, gridContainerRef]);
    useGridNavigation(gridContainerRef, () => handleAddItem());
    // Ctrl+S (registry id purchases.saveDraft) saves the draft instead of the browser's "Save page"
    useShortcutHandler('purchases.saveDraft', saveDraft);

    useMagicSubmit(null, () => {
        if (!drawerOpen && !scannedImageModalOpen) {
            const valid = cleanItemsBeforeSubmit();
            if (!valid) return;
            if (formRef.current?.requestSubmit) {
                formRef.current.requestSubmit();
            } else {
                handleSubmit(onSubmit, onInvalid)();
            }
        }
    });

    // ─── JSX ─────────────────────────────────────────────────────────────────

    return (
        <>
            <form
                ref={formRef}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            const valid = cleanItemsBeforeSubmit();
                            if (!valid) return;
                            handleSubmit(onSubmit, onInvalid)();
                            return;
                        }
                        const target = e.target as HTMLElement;
                        if (target.tagName !== 'TEXTAREA') {
                            // Prevent accidental submit on plain Enter from inputs
                            e.preventDefault();
                        }
                    }
                }}
                onSubmit={handleSubmit(onSubmit, onInvalid)} className="relative flex min-w-0 flex-col gap-2 xl:pb-20">

                {ocrStatus === 'processing' && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-xl">
                        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" aria-hidden="true" />
                        <h2 className="text-lg font-semibold text-slate-800">Analyzing Scanned Invoice</h2>
                        <p className="text-sm text-slate-500 mt-2">Extracting items, batches, and prices…</p>
                    </div>
                )}

                {ocrStatus === 'error' && (
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                        <p className="flex-1 text-sm text-red-800">
                            Invoice scan failed: {ocrError}
                        </p>
                        {invoiceToEdit?.status === 'SAVED' && <Button type="button" size="sm" variant="outline" onClick={retryOcr}>Retry scan</Button>}
                        <Button type="button" size="sm" variant="outline" onClick={() => setOcrStatus('idle')}>Dismiss</Button>
                    </div>
                )}

                {/* Scanned bills are never saved automatically: staff always check them against the paper bill. */}
                {ocrStatus === 'ready' && (
                    <div
                        className={ocrNeedsReview
                            ? 'border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900'
                            : 'border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900'}
                        role={ocrNeedsReview ? 'alert' : 'status'}
                        data-testid="ocr-review-banner"
                    >
                        <p className="font-semibold">
                            {ocrNeedsReview
                                ? 'Manual review required — the automatic checks could not confirm this scan'
                                : 'Review the scanned invoice against the paper bill before saving'}
                        </p>
                        {ocrReviewNotes.length > 0 ? (
                            <ul className="mt-1 list-disc space-y-0.5 pl-4">
                                {ocrReviewNotes.slice(0, ocrNeedsReview ? 8 : 5).map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
                                {ocrReviewNotes.length > (ocrNeedsReview ? 8 : 5) && (
                                    <li>{ocrReviewNotes.length - (ocrNeedsReview ? 8 : 5)} more fields need review.</li>
                                )}
                            </ul>
                        ) : (
                            <p className="mt-0.5">All automatic checks passed. Nothing is saved until you press Save.</p>
                        )}
                    </div>
                )}

                {/* View Image Dialog for Scans */}
                {scannedImage && (
                    <Dialog open={scannedImageModalOpen} onOpenChange={setScannedImageModalOpen}>
                        <div className="fixed bottom-32 right-6 z-40 sm:bottom-24 lg:bottom-16">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 rounded border-slate-300 bg-white px-2 text-xs text-slate-700 shadow-sm"
                                onClick={() => setScannedImageModalOpen(true)}
                            >
                                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                                View Scanned Invoice{scannedPages.length > 1 ? ` (${scannedPages.length} pages)` : ''}
                            </Button>
                        </div>
                        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                            <DialogHeader>
                                <DialogTitle>Scanned Invoice Image</DialogTitle>
                            </DialogHeader>
                            {scannedPages.length > 1 ? (
                                <div className="flex-1 space-y-4 overflow-auto rounded-md border border-border bg-slate-100 p-4">
                                    {scannedPages.map((src, i) => (
                                        <figure key={src} className="space-y-1">
                                            <figcaption className="text-xs font-semibold text-slate-600">Page {i + 1} of {scannedPages.length}</figcaption>
                                            <img src={src} alt={`Scanned invoice page ${i + 1}`} className="mx-auto max-w-full object-contain" />
                                        </figure>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex-1 overflow-auto bg-slate-100 rounded-md border border-border flex items-center justify-center p-4">
                                    {/* Use standard img tag instead of next/image since the URL is external/django */}
                                    <img
                                        src={scannedImage}
                                        alt="Scanned Invoice"
                                        className="max-w-full max-h-full object-contain"
                                    />
                                </div>
                            )}
                        </DialogContent>
                    </Dialog>
                )}

                {linkedPo && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                        <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
                        <span className="font-medium">Receiving against {linkedPo.poNumber}</span>
                        <span className="opacity-80">Lines show what is still owed. Saving this invoice updates the order.</span>
                        <button type="button" className="ml-auto text-xs font-semibold text-primary underline" onClick={() => { setLinkedPo(null); setValue('purchaseOrderRef', ''); }}>Unlink</button>
                    </div>
                )}
                {!linkedPo && !invoiceToEdit && (openPos?.results?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <FileText className="h-5 w-5 text-amber-600" aria-hidden="true" />
                        <span className="font-medium">{openPos!.results.length} open order{openPos!.results.length > 1 ? 's' : ''} from {partyLedger?.name}. Link one?</span>
                        {openPos!.results.map((o) => (
                            <button key={o.id} type="button" className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-amber-100" onClick={() => loadPo(o.id)}>
                                {o.poNumber} · {o.receivedQty}/{o.orderedQty} received
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Draft banner ────────────────────────────────────────── */}
                {hasDraft && (
                    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <FileText className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                        <p className="flex-1 text-sm text-amber-800">
                            You have an unsaved draft from a previous session.
                        </p>
                        <Button
                            type="button" size="sm" variant="outline"
                            className="h-7 border-amber-300 text-amber-700 hover:bg-amber-100"
                            onClick={restoreDraft}
                        >
                            Restore
                        </Button>
                        <Button
                            type="button" size="sm" variant="ghost"
                            className="h-7 text-amber-500 hover:text-amber-700"
                            onClick={() => { if (draftKey) localStorage.removeItem(draftKey); setHasDraft(false); }}
                        >
                            Discard
                        </Button>
                    </div>
                )}


                <section aria-label="Invoice details" className="border-b border-slate-300 bg-white">
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2 px-1 py-1.5 sm:grid-cols-2 lg:grid-cols-[minmax(270px,1.9fr)_minmax(160px,1fr)_minmax(150px,0.85fr)_minmax(130px,0.75fr)]">
                        <div className="min-w-0 space-y-0.5">
                            <Label className="text-xs font-semibold leading-none text-slate-700">Party <span className="text-red-500">*</span></Label>
                            <div className="w-full min-w-0" ref={partyRef}>
                                <LedgerPicker
                                    group="Sundry Creditors"
                                    value={partyLedger}
                                    onChange={(l) => {
                                        setPartyLedger(l);
                                        setValue('partyLedgerId', l?.id ?? '', { shouldValidate: true });
                                        // the picker's input goes away once a party is chosen: hand the cursor to the next box, or it is lost
                                        if (l) setTimeout(() => invoiceNoRef.current?.focus(), 0);
                                    }}
                                    placeholder="Select party ledger…"
                                    className={cn("h-8 text-sm [&_input]:h-8", errors.partyLedgerId && "ring-1 ring-red-400 rounded-md")}
                                />
                                {errors.partyLedgerId && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{errors.partyLedgerId.message}</p>}
                            </div>
                        </div>
                        <div className="min-w-0 space-y-0.5">
                            <Label className="text-xs font-semibold leading-none text-slate-700">Invoice No <span className="text-red-500">*</span></Label>
                            <div className="w-full min-w-0">
                                {(() => {
                                    const { ref: formRef, ...rest } = register('invoiceNo', { onChange: () => { if (errors.invoiceNo) void trigger('invoiceNo'); } });
                                    return (
                                        <Input
                                            ref={(e) => {
                                                invoiceNoRef.current = e;
                                                formRef(e);
                                            }}
                                            className={cn("h-8 border-slate-300 bg-white text-sm focus-visible:ring-ring", (errors.invoiceNo || isDuplicate) && "border-red-400 focus-visible:ring-red-400")}
                                            {...rest}
                                            placeholder="e.g. AJD-2026-0123"
                                        />
                                    );
                                })()}
                                {errors.invoiceNo ? (
                                    <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{errors.invoiceNo.message}</p>
                                ) : isDuplicate ? (
                                    <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1">
                                        <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Duplicate!
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        <div className="min-w-0 space-y-0.5">
                            <Label className="text-xs font-semibold leading-none text-slate-700">Invoice Date</Label>
                            <div className="w-full min-w-0">
                                {(() => {
                                    const { ref: formRef, ...rest } = register('invoiceDate');
                                    return (
                                        <Input
                                            className="h-8 border-slate-300 bg-white text-sm focus-visible:ring-ring"
                                            type="date"
                                            min="2020-01-01"
                                            max="2035-12-31"
                                            ref={(e) => {
                                                dateRef.current = e;
                                                formRef(e);
                                            }}
                                            {...rest}
                                        />
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="min-w-0 space-y-0.5">
                            <Label className="text-xs font-semibold leading-none text-slate-700">Purchase type <span className="text-red-500">*</span></Label>
                            <div className="w-full min-w-0">
                                <Select
                                    defaultValue="credit"
                                    onValueChange={(v) => {
                                        setValue('purchaseType', v as 'cash' | 'credit');
                                        if (v === 'cash') setValue('dueDate', undefined);
                                        else setValue('dueDate', defaultDueStr());
                                    }}
                                >
                                    <SelectTrigger className="h-8 border-slate-300 bg-white text-sm focus-visible:ring-ring">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="credit">Credit</SelectItem>
                                        <SelectItem value="cash">Cash</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2 border-t border-slate-200 bg-slate-50/50 px-1 py-1.5 sm:grid-cols-2 lg:grid-cols-[minmax(270px,1.9fr)_minmax(160px,1fr)_minmax(150px,0.85fr)_minmax(130px,0.75fr)]">
                        <div className="min-w-0 space-y-0.5">
                            <Label className="text-xs font-semibold leading-none text-slate-700">Godown</Label>
                            <div className="min-w-0 flex-1">
                                <Select defaultValue="main" onValueChange={(v) => setValue('godown', v)}>
                                    <SelectTrigger className="h-8 border-slate-300 bg-white text-sm focus-visible:ring-ring">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {GODOWNS.map((g) => (
                                            <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {watchedPurchaseType !== 'cash' && (
                            <div className="min-w-0 space-y-0.5">
                                <Label className="text-xs font-semibold leading-none text-slate-700">Credit Days</Label>
                                <div className="min-w-0 flex-1">
                                    <Select
                                        value={Number.isFinite(creditDays) ? creditDays.toString() : "30"}
                                        onValueChange={(val) => {
                                            const parsed = parseInt(val, 10);
                                            setCreditDays(Number.isFinite(parsed) ? parsed : 30);
                                        }}
                                    >
                                        <SelectTrigger className="h-8 border-slate-300 bg-white text-sm focus-visible:ring-ring">
                                            <SelectValue placeholder="Select days" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Array.from(new Set([7, 15, 30, 45, 60, 90, creditDays])).sort((a, b) => a - b).map(d => (
                                                <SelectItem key={d} value={d.toString()}>{d} Days</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <input type="hidden" {...register('dueDate')} />
                                </div>
                            </div>
                        )}
                        <div className="min-w-0 space-y-0.5">
                            <Label className="text-xs font-semibold leading-none text-slate-700">PO Ref</Label>
                            <div className="min-w-0 flex-1">
                                {(() => {
                                    const { ref: formRef, ...rest } = register('purchaseOrderRef');
                                    return (
                                        <Input
                                            className="h-8 border-slate-300 bg-white text-sm focus-visible:ring-ring"
                                            ref={(e) => {
                                                poRef.current = e;
                                                formRef(e);
                                            }}
                                            {...rest}
                                            placeholder="Optional"
                                        />
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="min-w-0 space-y-0.5">
                            <Label className="text-xs font-semibold leading-none text-slate-700">Notes</Label>
                            <div className="min-w-0 flex-1">
                                {(() => {
                                    const { ref: formRef, ...rest } = register('notes');
                                    return (
                                        <Textarea
                                            className="h-8 min-h-8 resize-y border-slate-300 bg-white py-1 text-sm focus-visible:ring-ring"
                                            ref={(e) => {
                                                notesRef.current = e;
                                                formRef(e);
                                            }}
                                            {...rest}
                                            placeholder="Optional notes…"
                                        />
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </section>

                <section aria-label="Medicine entry" className="min-w-0 border-y border-slate-300 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-1 py-1">
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-xs font-semibold text-slate-800">Medicines</h3>
                            <span className="text-xs tabular-nums text-slate-600">{items.length} row{items.length !== 1 ? 's' : ''}</span>
                            {nearExpiryCount > 0 && (
                                <span data-testid="near-expiry-chip" role="status" className="inline-flex items-center gap-1 rounded bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-900">
                                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                    {nearExpiryCount} expired or under 90 days: check with the distributor
                                </span>
                            )}
                            {totalUnits > 0 && (
                                <span className="text-xs tabular-nums text-slate-600">
                                    {totalUnits.toLocaleString('en-IN')} units
                                </span>
                            )}
                        </div>
                        <Button
                            type="button" variant="outline" size="sm"
                            className="h-7 gap-1 rounded border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            onClick={handleAddItem}
                        >
                            <Plus className="h-3 w-3" aria-hidden="true" /> Add Item
                        </Button>
                    </div>

                    {errors.items && typeof errors.items.message === 'string' && (
                        <p role="alert" className="flex items-center gap-1.5 border-b border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />{errors.items.message}
                        </p>
                    )}

                    {/* No inner scroll box: every row shows and the PAGE scrolls (the column header stays pinned while it does). The table needs 1308px, so
                        from 1380px up nothing scrolls sideways (overflow-x-clip keeps the pinned header working); on a tablet only the sideways scroll remains. */}
                    <div className="relative min-h-[200px] overflow-x-auto min-[1380px]:overflow-x-clip" ref={gridContainerRef}>
                        <table aria-label="Purchase items" className="w-full min-w-[1308px] table-fixed border-separate border-spacing-0 text-xs">
                            <colgroup>
                                {PURCHASE_ITEM_COLS.map((col) => (
                                    <col key={col.key} style={col.key === 'product' ? undefined : { width: col.width }} />
                                ))}
                            </colgroup>
                            <thead className="sticky top-[var(--app-header-h,0px)] z-30 bg-slate-100">
                                <tr>
                                    <th className={cn(purchaseGridHeaderCell, 'sticky left-0 z-40 border-l border-t text-center')}>#</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-left sm:sticky sm:left-8 sm:z-40')}>Product</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-left')}>HSN</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-left')}>Batch</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-left')}>Expiry</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right')}>Pkg</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right')}>Qty</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right')}>Free</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right')}>MRP</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right')}>Rate</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right')}>GST%</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right')}>PTR</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right')}>PTS</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right')}>Disc%</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right sm:sticky sm:right-[60px] sm:z-40 sm:shadow-[-6px_0_6px_-6px_rgba(15,23,42,0.3)]')}>Amount</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-center sm:sticky sm:right-[30px] sm:z-40')} title="Pricing details" aria-label="Pricing details">⋯</th>
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-center sm:sticky sm:right-0 sm:z-40')} title="Remove item" aria-label="Remove item">×</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => (
                                    <PurchaseItemRow
                                        key={idx}
                                        index={idx}
                                        value={item}
                                        onChange={handleItemChange}
                                        onRemove={handleRemoveItem}
                                        onSelectProduct={handleSelectProduct}
                                        onOpenAddProduct={handleOpenAddProduct}
                                        outletId={outletId}
                                        errors={(errors.items as any)?.[idx]}
                                        scanPages={scannedPages}
                                        scanPageSizes={scannedPageSizes}
                                    />
                                ))}
                            </tbody>
                        </table>
                        <div className="sticky left-0 border-t border-slate-200 bg-slate-50 px-1 py-1">
                            <Button
                                type="button" variant="ghost" size="sm" data-testid="add-row-bottom"
                                className="h-8 w-full justify-center gap-1.5 rounded border border-dashed border-slate-300 bg-white text-xs font-semibold text-primary hover:bg-blue-50 hover:text-primary"
                                onClick={handleAddItem}
                            >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add another medicine
                            </Button>
                        </div>
                        {!items.some((it) => (it.productId && it.productId.trim() !== '') || (it.productName && it.productName.trim() !== '')) && (
                            <p data-testid="grid-empty-hint" className="sticky left-0 px-3 py-4 text-sm text-slate-600">
                                Start typing a medicine name in the <strong className="font-semibold text-slate-800">Product</strong> column. <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 text-xs">Tab</kbd> moves to the next field, <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 text-xs">Ctrl</kbd>+<kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 text-xs">Enter</kbd> saves.
                            </p>
                        )}
                    </div>
                </section>

                <section aria-label="Invoice adjustments" className="border-y border-slate-200 bg-white px-1 py-1">
                    <h3 className="mb-0.5 text-xs font-semibold text-slate-800">Invoice adjustments</h3>
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2 xl:grid-cols-[minmax(250px,1fr)_minmax(260px,1fr)_minmax(350px,2fr)]">
                        <div className="flex min-w-0 items-center gap-2">
                            <Label htmlFor="pp-freight" className="shrink-0 whitespace-nowrap text-xs font-semibold text-slate-700">Freight / Transport (₹)</Label>
                            <Input
                                id="pp-freight" autoComplete="off" inputMode="decimal"
                                type="number" step="0.01" min="0"
                                className="h-8 min-w-0 flex-1 rounded border-slate-300 text-sm"
                                placeholder="0.00"
                                {...register('freight', { valueAsNumber: true })}
                            />
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                            <Label htmlFor="pp-invoice-discount" className="flex shrink-0 justify-between gap-1 whitespace-nowrap text-xs font-semibold text-slate-700">
                                <span>Invoice Discount (₹)</span>
                                {invoiceDiscountPct > 0 && (
                                    <span className="text-emerald-600">{(invoiceDiscountPct * 100).toFixed(2)}%</span>
                                )}
                            </Label>
                            <Input
                                id="pp-invoice-discount" autoComplete="off" inputMode="decimal"
                                type="number" step="0.01" min="0"
                                className="h-8 min-w-0 flex-1 rounded border-slate-300 text-sm text-slate-800"
                                placeholder="0.00"
                                {...register('invoiceDiscount', { valueAsNumber: true })}
                            />
                        </div>
                        <div className="min-w-0 border-t border-slate-200 pt-1 md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
                            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                                <div>
                                    <p className="text-xs font-semibold text-slate-700">Ledger Adjustment</p>
                                    <p className="text-[11px] text-slate-500">
                                        Apply credit from distributor account (return, advance, write-off)
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <select
                                        aria-label="Ledger adjustment: subtract or add"
                                        className="h-8 cursor-pointer rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        value={adjustmentSign}
                                        onChange={(e) => {
                                            setAdjustmentSign(e.target.value as '-' | '+');
                                            // optionally re-evaluate cap if they switch from + to -
                                            if (e.target.value === '-') setLedgerAdjustment((prev) => Math.min(prev, computedTotal));
                                        }}
                                    >
                                        <option value="-">&minus; (Subtract)</option>
                                        <option value="+">+ (Add)</option>
                                    </select>
                                    <span className="text-sm font-medium text-slate-600">₹</span>
                                    <input
                                        type="number"
                                        aria-label="Ledger adjustment amount (₹)" autoComplete="off" inputMode="decimal"
                                        min={0}
                                        // Only cap at computedTotal if it's a deduction ('-')
                                        max={adjustmentSign === '-' ? computedTotal : undefined}
                                        step="0.01"
                                        className="h-8 w-24 rounded border border-slate-300 bg-white px-2 text-right text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder="0.00"
                                        value={ledgerAdjustment || ''}
                                        onChange={(e) => {
                                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                                            if (adjustmentSign === '-') {
                                                setLedgerAdjustment(Math.min(val, computedTotal));
                                            } else {
                                                setLedgerAdjustment(val);
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {ledgerAdjustment > 0 && (
                                <div className="mt-1">
                                    <input
                                        aria-label="Ledger adjustment reason" autoComplete="off"
                                        className="h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        placeholder="Reason (e.g. Return CN-2024-45, Advance payment)"
                                        value={ledgerNote}
                                        onChange={(e) => setLedgerNote(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* ── Reason for Modification (Edit Mode Only) ──────────────── */}
                {invoiceToEdit && invoiceToEdit.status !== 'SAVED' && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                            <FileText className="h-4 w-4" aria-hidden="true" />
                            Reason for Modification
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="pp-revision-code" className="text-blue-800">Action Type / Reason Code <span className="text-rose-500">*</span></Label>
                                <select
                                    id="pp-revision-code"
                                    className="w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    value={revisionReasonCode}
                                    onChange={(e) => setRevisionReasonCode(e.target.value)}
                                >
                                    <option value="">Select a reason…</option>
                                    {REVISION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pp-revision-text" className="text-blue-800">Detailed Explanation <span className="text-rose-500">*</span></Label>
                                <Textarea
                                    id="pp-revision-text"
                                    className="min-h-[80px] bg-white border-blue-200 focus-visible:ring-blue-500/20"
                                    placeholder="Explain why you are modifying this purchase invoice…"
                                    value={revisionReasonText}
                                    onChange={(e) => setRevisionReasonText(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Transaction totals and actions remain available during long invoices. */}
                <footer className="relative z-40 border-t border-slate-300 bg-white xl:fixed xl:inset-x-0 xl:bottom-0">
                    <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 sm:px-6">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-slate-600">
                            {totalTradeDisc + totalCashDisc > 0 && (
                                <span>Item discounts <strong className="font-mono text-slate-800">− {fmt(totalTradeDisc + totalCashDisc)}</strong></span>
                            )}
                            {invoiceDiscount > 0 && (
                                <span>Invoice discount ({(invoiceDiscountPct * 100).toFixed(2)}%) <strong className="font-mono text-slate-800">− {fmt(invoiceDiscount)}</strong></span>
                            )}
                            <span>Taxable <strong className="font-mono text-slate-900">{fmt(taxableValue)}</strong></span>
                            <span>GST <strong className="font-mono text-slate-900">{fmt(totalGST)}</strong></span>
                            {ledgerAdjustment > 0 && (
                                <span className={adjustmentSign === '-' ? 'text-emerald-700' : 'text-rose-700'}>
                                    Adjustment <strong className="font-mono">{adjustmentSign === '-' ? '−' : '+'} {fmt(ledgerAdjustment)}</strong>
                                </span>
                            )}
                            <span className="border-l border-slate-300 pl-3 font-semibold text-slate-800">
                                Net payable <strong className="ml-1 font-mono text-base text-slate-950">{fmt(netPayable)}</strong>
                            </span>
                            {watchedPurchaseType === 'credit' && <span className="text-xs text-slate-600">Due {watch('dueDate') ?? '—'}</span>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <Button type="button" variant="outline" size="sm" className="h-8 rounded border-slate-300 px-2 text-xs text-slate-700" onClick={saveDraft} title="Shortcut: Ctrl + S">
                                <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Save Draft <span className="ml-1 hidden text-[11px] text-slate-600 md:inline">Ctrl+S</span>
                            </Button>
                            <Button type="button" variant="outline" onClick={requestLeave} className="h-8 rounded border-slate-300 px-2 text-xs">
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                onClick={(e) => {
                                    // We submit explicitly below: stop the button's own form submit, or every click saves the bill twice.
                                    e.preventDefault();
                                    const valid = cleanItemsBeforeSubmit();
                                    if (!valid) return;
                                    handleSubmit(onSubmit, onInvalid)();
                                }}
                                disabled={isSubmitting}
                                className="h-8 min-w-[90px] rounded bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                                title="Shortcut: Ctrl + Enter"
                            >
                                {isSubmitting ? 'Saving…' : (invoiceToEdit && invoiceToEdit.status !== 'SAVED') ? 'Update' : 'Save'}
                                <span className="ml-1 hidden text-[11px] font-normal opacity-90 md:inline">Ctrl+Enter</span>
                            </Button>
                        </div>
                    </div>
                </footer>

            </form>

            <PackSizeConfirmDialog mismatches={packConfirm} onConfirm={confirmPackSizes} onReview={() => cancelPackConfirm()} />
            <LeavePurchaseDialog
                open={leaveOpen}
                onOpenChange={setLeaveOpen}
                canSaveDraft={!isEditSaved}
                onSaveDraft={() => { saveDraft(); setLeaveOpen(false); onSuccess(); }}
                onDiscard={() => { discardDraft(); setLeaveOpen(false); onSuccess(); }}
            />
            <AddNewProductDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                initialName={drawerInitialName}
                onSuccess={handleProductCreated}
            />
        </>
    );
}

/**
 * The New Purchase screen. Phones (below 768px) get their own layout (components/purchases/mobile: cards and sheets); tablets and desktop keep
 * the entry grid above. Both show the same purchase from `usePurchaseEntry`, so purchase rules live there and never in a layout.
 */
export function NewPurchaseForm(props: NewPurchaseFormProps) {
    const isPhone = useIsPhone();
    // null until the browser has been asked: a neutral placeholder, so nobody sees the grid flash on a phone
    if (isPhone === null) return <div className="py-10 text-center text-sm font-medium text-slate-600">Loading…</div>;
    return isPhone ? <MobilePurchase {...props} /> : <PurchaseGridForm {...props} />;
}
