/** Test helpers for the phone purchase components: a stand-in for `usePurchaseEntry()` (never imported by the app itself). */
import React, { useState } from 'react';
import type { PurchaseEntry } from '@/hooks/usePurchaseEntry';
import type { PurchaseItemFormData } from '@/types';
import { emptyItem } from '@/lib/purchaseEntry';

export const goodLine = (extra: Partial<PurchaseItemFormData> = {}): PurchaseItemFormData => ({
    ...emptyItem(), productId: 'p1', productName: 'DOLO 650', packUnitLabel: 'Tablet', pkg: 15, batchNo: 'B1', expiryDate: '2099-12-01', qty: 10, freeQty: 2,
    purchaseRate: 22.5, mrp: 32.1, gstRate: 5, hsnCode: '3004', ...extra,
});

/** A plain stand-in: values come from `values`, every action is a jest.fn(). */
export function makeEntry(over: Record<string, unknown> = {}, values: Record<string, unknown> = {}): PurchaseEntry {
    const base: Record<string, unknown> = {
        items: [emptyItem()], outletId: 'o1', errors: {}, isDuplicate: false, isSubmitting: false, partyLedger: null, creditDays: 30, watchedPurchaseType: 'credit',
        linkedPo: null, openPos: undefined, hasDraft: false, draftKey: 'k', nearExpiryCount: 0,
        ocrStatus: 'idle', ocrError: '', ocrNeedsReview: false, ocrReviewNotes: [], scannedImage: null, scannedPages: [], scannedImageModalOpen: false,
        goodsValue: 0, totalTradeDisc: 0, totalCashDisc: 0, invoiceDiscount: 0, invoiceDiscountPct: 0, taxableValue: 0, totalGST: 0, totalCess: 0,
        cgst: 0, sgst: 0, igst: 0, freight: 0, roundOff: 0, computedTotal: 0, ledgerAdjustment: 0, adjustmentSign: '-', ledgerNote: '', effectiveAdjustment: 0,
        netPayable: 0, totalUnits: 0, isInterstate: false,
        revisionReasonCode: '', revisionReasonText: '', drawerOpen: false, drawerInitialName: '',
    };
    const vals: Record<string, unknown> = { partyLedgerId: '', invoiceNo: '', invoiceDate: '2026-11-13', godown: 'main', purchaseType: 'credit', freight: 0, invoiceDiscount: 0, notes: '', purchaseOrderRef: '', dueDate: '2026-12-13', ...values };
    const fns = ['setPartyLedger', 'setValue', 'setCreditDays', 'setLedgerAdjustment', 'setAdjustmentSign', 'setLedgerNote', 'setOcrStatus', 'retryOcr', 'setScannedImageModalOpen',
        'setLinkedPo', 'loadPo', 'restoreDraft', 'setHasDraft', 'handleItemChange', 'handleSelectProduct', 'handleOpenAddProduct', 'handleRemoveItem', 'handleAddItem', 'saveDraft',
        'setRevisionReasonCode', 'setRevisionReasonText', 'cleanItemsBeforeSubmit', 'onSubmit', 'onInvalid', 'setDrawerOpen', 'handleProductCreated'];
    const out: Record<string, unknown> = { ...base };
    for (const f of fns) out[f] = jest.fn();
    out.watch = (k?: string) => (k ? vals[k] : vals);
    out.handleSubmit = jest.fn(() => jest.fn());
    return { ...out, ...over } as unknown as PurchaseEntry;
}

/** An entry whose lines really change: `handleItemChange` / remove / add / select edit a local list, so a sheet can be typed into. */
export function EntryHarness({ initial, extra, children }: { initial: PurchaseItemFormData[]; extra?: Record<string, unknown>; children: (entry: PurchaseEntry, items: PurchaseItemFormData[]) => React.ReactNode }) {
    const [items, setItems] = useState(initial);
    const calls = React.useRef({ selected: [] as Array<{ i: number; id: string }>, opened: [] as Array<{ i: number; name: string }> });
    const entry = makeEntry({
        items,
        handleItemChange: (i: number, field: keyof PurchaseItemFormData, v: string | number) => setItems((p) => p.map((it, n) => (n === i ? { ...it, [field]: v } : it))),
        handleRemoveItem: (i: number) => setItems((p) => { const next = p.filter((_, n) => n !== i); return next.length ? next : [emptyItem()]; }),
        handleAddItem: () => setItems((p) => [...p, emptyItem()]),
        handleSelectProduct: (i: number, prod: { id: string; name: string; packSize?: number; packUnit?: string; gstRate?: number; mrp?: number; hsnCode?: string }) => {
            calls.current.selected.push({ i, id: prod.id });
            setItems((p) => p.map((it, n) => (n === i ? { ...it, productId: prod.id, productName: prod.name, pkg: prod.packSize ?? 1, packUnitLabel: prod.packUnit ?? '', gstRate: prod.gstRate ?? 0, mrp: prod.mrp ?? 0, hsnCode: prod.hsnCode ?? '' } : it)));
        },
        handleOpenAddProduct: (i: number, name: string) => { calls.current.opened.push({ i, name }); },
        ...extra,
    });
    (entry as unknown as { __calls: typeof calls.current }).__calls = calls.current;
    return <>{children(entry, items)}</>;
}
