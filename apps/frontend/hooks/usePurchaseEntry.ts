'use client';

/**
 * The New Purchase screen's state and behaviour: the form, the lines, totals, draft, scanned-bill loading, purchase-order linking,
 * validation and save. The desktop grid (`components/purchases/NewPurchaseForm`) and the phone layout
 * (`components/purchases/mobile`) are two ways of showing this and must not hold purchase rules of their own.
 * (Keyboard shortcuts such as Enter-to-next-cell and Ctrl+Enter are desktop-only and stay in the desktop component.)
 */
import { createElement, useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, addDays, differenceInDays } from 'date-fns';
import { API_URL } from '@/lib/apiClient';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useCreatePurchase, useUpdatePurchase, useCheckDuplicateInvoice, useConfirmDraft } from '@/hooks/usePurchases';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useOutletId } from '@/hooks/useOutletId';
import { buildPurchasePayload } from '@/utils/payloadBuilders';
import { poApi } from '@/lib/poApi';
import { useOpenPOs } from '@/hooks/usePO';
import { ToastAction, type ToastActionElement } from '@/components/ui/toast';
import { isStartedLine } from '@/lib/purchaseLine';
import { packMismatches, type PackMismatch } from '@/lib/purchasePack';
import type { PurchaseItemFormData, ProductSearchResult, Ledger, PurchaseInvoiceFull } from '@/types';
import {
    schema, emptyItem, todayStr, defaultDueStr, ocrNumber, isNearExpiry, normalizeExpiry,
    computePurchaseTotals, isInterstateSupply, type FormData,
} from '@/lib/purchaseEntry';

export interface UsePurchaseEntryOptions {
    onSuccess: (updatedInvoiceId?: string) => void;
    invoiceToEdit?: PurchaseInvoiceFull | null;
}

export function usePurchaseEntry({ onSuccess, invoiceToEdit }: UsePurchaseEntryOptions) {
    const searchParams = useSearchParams();
    const poId = searchParams?.get('poId');
    // The purchase order this invoice receives goods for (sent to the server as purchaseOrderId)
    const [linkedPo, setLinkedPo] = useState<{ id: string; poNumber: string } | null>(null);

    const { toast } = useToast();
    const outletId = useOutletId();
    const outlet = useAuthStore((s) => s.outlet);
    const formRef = useRef<HTMLFormElement>(null);
    const user = useAuthStore((s) => s.user);
    const outletState = useSettingsStore((s) => s.outletState) || outlet?.state || 'Maharashtra';

    // M5: scope the draft key to this outlet+user so drafts never bleed between
    // staff members or tenants sharing the same browser.
    const draftKey = outlet?.id && user?.id
        ? `purchase_form_draft_${outlet.id}_${user.id}`
        : null;
    const createPurchase = useCreatePurchase();
    const updatePurchase = useUpdatePurchase();
    const confirmDraft = useConfirmDraft();
    const [partyLedger, setPartyLedger] = useState<Ledger | null>(null);

    const [items, setItems] = useState<PurchaseItemFormData[]>([emptyItem()]);
    const [hasDraft, setHasDraft] = useState(false);

    // PKG safety (see lib/purchasePack.ts): lines whose PKG contradicts the catalogue wait for a yes before saving, and a pack size the server
    // refuses is pointed out on its line
    const [packConfirm, setPackConfirm] = useState<PackMismatch[] | null>(null);
    const packAckRef = useRef(false);
    const [pkgServerIssue, setPkgServerIssue] = useState<{ index: number; message: string } | null>(null);

    // Refs for enter navigation
    const partyRef = useRef<HTMLDivElement>(null);
    const invoiceNoRef = useRef<HTMLInputElement | null>(null);
    const dateRef = useRef<HTMLInputElement | null>(null);
    const poRef = useRef<HTMLInputElement | null>(null);
    const notesRef = useRef<HTMLTextAreaElement | null>(null);
    const gridContainerRef = useRef<HTMLDivElement>(null);


    const [ledgerAdjustment, setLedgerAdjustment] = useState<number>(0);
    const [adjustmentSign, setAdjustmentSign] = useState<'-' | '+'>('-');
    const [ledgerNote, setLedgerNote] = useState<string>('');
    const [revisionReasonCode, setRevisionReasonCode] = useState<string>('');
    const [revisionReasonText, setRevisionReasonText] = useState<string>('');

    // ── Add-product drawer state ───────────────────────────────────────────────
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerInitialName, setDrawerInitialName] = useState('');
    const [activeDrawerRow, setActiveDrawerRow] = useState(0);

    const [ocrStatus, setOcrStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>('idle');
    const [ocrError, setOcrError] = useState('');
    const [ocrReviewNotes, setOcrReviewNotes] = useState<string[]>([]);
    // Set when the automatic checks could not confirm the scanned reading.
    const [ocrNeedsReview, setOcrNeedsReview] = useState(false);
    const [ocrRetrySequence, setOcrRetrySequence] = useState(0);
    const [scannedImage, setScannedImage] = useState<string | null>(null);
    // Every page of a multi-page scan (page 1 first); scannedImage is page 1.
    const [scannedPages, setScannedPages] = useState<string[]>([]);
    const [scannedPageSizes, setScannedPageSizes] = useState<number[][]>([]);
    // One save at a time: a double click, or Ctrl+Enter plus a click, must not send the bill twice.
    const submitInFlightRef = useRef(false);
    const [scannedImageModalOpen, setScannedImageModalOpen] = useState(false);

    const handleOpenAddProduct = (rowIndex: number, name: string) => {
        setActiveDrawerRow(rowIndex);
        setDrawerInitialName(name);
        setDrawerOpen(true);
    };

    const handleSelectProduct = (rowIndex: number, product: ProductSearchResult) => {
        packAckRef.current = false;
        if (pkgServerIssue?.index === rowIndex) setPkgServerIssue(null);
        const firstBatch = product.batches?.[0];
        const mrp = firstBatch?.mrp ?? product.mrp ?? 0;
        const saleRate = firstBatch?.saleRate ?? product.saleRate ?? 0;
        const gstRate = product.gstRate ?? 0;
        setItems((prev) => {
          const next = prev.map((item, i) => {
            if (i !== rowIndex) return item;
            const newPkg = typeof product.packSize === 'number' && product.packSize > 0 ? product.packSize : ('' as unknown as number);
            // On a row filled from a scanned bill, the bill is the source of truth
            // for this purchase's MRP and GST — don't replace them with old stock values.
            const fromBill = !!item.ocrOriginalName;
            return {
                ...item,
                productId: product.id,
                productName: product.name,
                isCustom: false,
                hsnCode: (fromBill && item.hsnCode) ? item.hsnCode : (product.hsnCode ?? item.hsnCode),
                pkg: newPkg,
                // the catalogue's size, kept only so the screen can say when this line's PKG differs from it
                catalogPkg: typeof product.packSize === 'number' && product.packSize > 0 ? product.packSize : undefined,
                packUnitLabel: product.packUnit || '',
                gstRate: fromBill && item.gstRate > 0 ? item.gstRate : gstRate,
                mrp: fromBill && item.mrp > 0 ? item.mrp : mrp,
                saleRate,
                // A human picked it: treat as confirmed, drop the suggestion chips.
                ocrMatchConfidence: fromBill ? 1 : item.ocrMatchConfidence,
                ocrSuggestions: [],
            };
          });
          // the form keeps its own copy of the lines for validation: without this a medicine picked and then saved straight away was
          // still a blank row to the save check, and the clerk was told to "pick the medicine" that was right there
          setValue('items', next);
          return next;
        });
    };

    const handleProductCreated = (product: ProductSearchResult) => {
        handleSelectProduct(activeDrawerRow, product);
        toast({ title: 'Product added successfully' });
    };


    const {
        register, handleSubmit, setValue, setError, clearErrors, trigger,
        watch, reset,
        formState: { errors, isSubmitting, isDirty },
    } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            partyLedgerId: '',
            invoiceNo: '',
            godown: 'main',
            notes: '',
            purchaseType: 'credit',
            invoiceDate: todayStr(),
            dueDate: defaultDueStr(),
            freight: 0,
            invoiceDiscount: 0,
            items: [emptyItem()],
        },
    });

    const watchedPurchaseType = watch('purchaseType');
    const watchedFreight = watch('freight') ?? 0;
    const watchedInvoiceDiscount = watch('invoiceDiscount') ?? 0;
    const watchedInvoiceNo = watch('invoiceNo');
    const watchedPartyLedgerId = watch('partyLedgerId');
    const watchedInvoiceDate = watch('invoiceDate');

    // ─── Credit Days Logic ────────────────────────────────────────────────────────
    const [creditDays, setCreditDays] = useState<number>(30);

    // Sync credit days from edit invoice
    useEffect(() => {
        if (invoiceToEdit && invoiceToEdit.dueDate && invoiceToEdit.invoiceDate && invoiceToEdit.purchaseType === 'credit') {
            const diff = differenceInDays(new Date(invoiceToEdit.dueDate), new Date(invoiceToEdit.invoiceDate));
            setCreditDays(diff > 0 ? diff : 30);
        }
    }, [invoiceToEdit]);



    // Centralize due date math
    useEffect(() => {
        if (watchedPurchaseType === 'credit' && watchedInvoiceDate) {
            const date = new Date(watchedInvoiceDate);
            if (!isNaN(date.getTime())) {
                const safeDays = Number.isFinite(creditDays) ? creditDays : 30;
                try {
                    setValue('dueDate', format(addDays(date, safeDays), 'yyyy-MM-dd'));
                } catch (e) {
                    console.error('Failed to calculate due date:', e);
                }
            }
        } else if (watchedPurchaseType === 'cash') {
            setValue('dueDate', undefined);
        }
    }, [watchedInvoiceDate, creditDays, watchedPurchaseType, setValue]);
    // ──────────────────────────────────────────────────────────────────────────────

    // Check for duplicate invoice
    const duplicateInvoiceQuery = useCheckDuplicateInvoice(watchedInvoiceNo, watchedPartyLedgerId);
    // Don't show duplicate warning if we are editing that exact invoice
    const isDuplicate = duplicateInvoiceQuery.data?.exists && (!invoiceToEdit || invoiceToEdit.invoiceNo?.toLowerCase() !== watchedInvoiceNo?.toLowerCase());

    // Initialize form if editing — must be after useForm so `reset` is in scope
    useEffect(() => {
        if (!invoiceToEdit) {
            setOcrStatus('idle');
            setOcrReviewNotes([]);
            setOcrNeedsReview(false);
            setScannedImage(null);
            setScannedPages([]);
            setScannedPageSizes([]);
            return;
        }

        if (invoiceToEdit.status === 'SAVED') {
            setOcrStatus('processing');
            setOcrError('');
            setScannedImage((invoiceToEdit as any).invoiceImageUrl || null);
            let cancelled = false;
            let pollTimer: ReturnType<typeof setTimeout> | undefined;
            let attempts = 0;

            const pollStatus = async () => {
                if (!outlet?.id) return;
                try {
                    const res = await api.get(`/purchases/${invoiceToEdit.id}/ocr-status/`, {
                        params: { outletId: outlet.id }
                    });
                    if (cancelled) return;

                    if (res.data.status === 'processing') {
                        attempts += 1;
                        if (attempts >= 90) {
                            setOcrStatus('error');
                            setOcrError('Invoice scanning is taking longer than expected. You can retry without uploading again.');
                        } else {
                            pollTimer = setTimeout(pollStatus, 2000);
                        }
                    } else if (res.data.status === 'ready') {
                        const ocrData = res.data;
                        setOcrStatus('ready');
                        setScannedImage(ocrData.invoiceImageUrl ? new URL(ocrData.invoiceImageUrl, API_URL).toString() : null);
                        setScannedPages(((ocrData.invoiceImageUrls as string[] | undefined) ?? [])
                            .filter(Boolean).map((u) => new URL(u, API_URL).toString()));
                        setScannedPageSizes(Array.isArray(ocrData.pageSizes) ? ocrData.pageSizes : []);

                        // Set the Ledger object directly so the UI updates
                        if (ocrData.header?.partyLedger) {
                            setPartyLedger(ocrData.header.partyLedger);
                        } else {
                            setPartyLedger(null);
                        }

                        const formItems: PurchaseItemFormData[] = (ocrData.items || []).map((item: any) => ({
                            productId: item.medicineMatch?.productId || '',
                            productName: item.medicineMatch?.productId ? (item.medicineMatch?.productName || item.medicineMatch?.product_name || item.name) : item.name,
                            isCustom: false,
                            hsnCode: item.hsnCode || item.medicineMatch?.hsnCode || item.medicineMatch?.hsn_code || '',
                            batchNo: item.batchNo || '',
                            expiryDate: normalizeExpiry(item.expiry || ''),
                            // not known -> blank, so the clerk has to say; it used to default to 1 (10 strips saved as 10 tablets)
                            pkg: (ocrNumber(item.medicineMatch?.packSize ?? item.medicineMatch?.pack_size ?? item.packSize) || '') as unknown as number,
                            catalogPkg: ocrNumber(item.medicineMatch?.packSize ?? item.medicineMatch?.pack_size) || undefined,
                            packUnitLabel: item.medicineMatch?.packUnit || item.medicineMatch?.pack_unit || '',
                            qty: ocrNumber(item.qty),
                            freeQty: ocrNumber(item.freeQty),
                            purchaseRate: ocrNumber(item.rate),
                            freightPerUnit: 0,
                            otherCostPerUnit: 0,
                            discountPct: ocrNumber(item.discount),
                            cashDiscountPct: 0,
                            gstRate: ocrNumber(item.gstPct !== '' && item.gstPct != null
                                ? item.gstPct
                                : (item.medicineMatch?.gstRate ?? item.medicineMatch?.gst_rate)),
                            cess: 0,
                            mrp: ocrNumber(item.mrp),
                            ptr: 0,
                            pts: 0,
                            saleRate: 0,
                            ocrOriginalName: item.ocrOriginalName || item.name || '',
                            ocrMatchConfidence: item.medicineMatch?.productId ? Number(item.medicineMatch?.confidence ?? 0) : 0,
                            ocrSuggestions: Array.isArray(item.medicineMatch?.suggestions) ? item.medicineMatch.suggestions : [],
                            ocrRowBox: item.rowBox ?? null,
                            ocrRowNote: item.rowCheckOk === false ? (item.rowCheckNote || 'Values may be from another row.') : undefined,
                        }));

                        setItems(formItems.length ? formItems : [emptyItem()]);
                        const reviewNotes: string[] = [];
                        if (ocrData.scanPhotoRemoved) {
                            reviewNotes.push('The scan photo was removed (photos are deleted 24 hours after scanning). Check the rows against the paper bill.');
                        }
                        if (!ocrData.header?.partyLedgerId) reviewNotes.push('Select the distributor ledger.');
                        if (!ocrData.header?.invoiceNo) reviewNotes.push('Enter the invoice number.');
                        if (!ocrData.header?.invoiceDate) reviewNotes.push('Enter the invoice date.');
                        if (!formItems.length) reviewNotes.push('No medicine lines were recognized; enter them manually.');
                        const unmatchedCount = formItems.filter((item) => !item.productId).length;
                        if (unmatchedCount) reviewNotes.push(`Select a catalog product for ${unmatchedCount} medicine line${unmatchedCount === 1 ? '' : 's'}.`);
                        const missingBatchCount = formItems.filter((item) => !item.batchNo).length;
                        if (missingBatchCount) reviewNotes.push(`Enter the batch number on ${missingBatchCount} medicine line${missingBatchCount === 1 ? '' : 's'}.`);
                        const missingExpiryCount = formItems.filter((item) => !item.expiryDate).length;
                        if (missingExpiryCount) reviewNotes.push(`Enter the expiry date on ${missingExpiryCount} medicine line${missingExpiryCount === 1 ? '' : 's'}.`);
                        const missingTaxCount = (ocrData.items || []).filter((item: any) =>
                            (item.gstPct === '' || item.gstPct == null) && item.medicineMatch?.gstRate == null
                        ).length;
                        if (missingTaxCount) reviewNotes.push(`Verify GST on ${missingTaxCount} medicine line${missingTaxCount === 1 ? '' : 's'}.`);
                        const amountIssues = (ocrData.items || []).filter((item: any) => item.validationOk === false).length;
                        if (amountIssues) reviewNotes.push(`Review the amount on ${amountIssues} medicine line${amountIssues === 1 ? '' : 's'}.`);
                        for (const warning of ocrData.warnings || []) {
                            if (typeof warning === 'string' && !warning.startsWith('Medicine not found in inventory:')) reviewNotes.push(warning);
                        }
                        setOcrReviewNotes(reviewNotes);
                        setOcrNeedsReview(!!ocrData.needsReview);

                        reset({
                            partyLedgerId: ocrData.header?.partyLedgerId || '',
                            purchaseType: 'credit',
                            invoiceNo: ocrData.header?.invoiceNo || '',
                            invoiceDate: ocrData.header?.invoiceDate || '',
                            dueDate: undefined,
                            purchaseOrderRef: '',
                            godown: 'main',
                            freight: 0,
                            invoiceDiscount: 0,
                            notes: '',
                            items: formItems.length ? formItems : [emptyItem()],
                        });

                    } else {
                        setOcrStatus('error');
                        setOcrError(res.data.message || 'OCR failed');
                    }
                } catch (err: any) {
                    if (cancelled) return;
                    setOcrStatus('error');
                    setOcrError(err.error?.message || err.response?.data?.error?.message || 'Could not check invoice scan status. Please retry.');
                }
            };
            pollStatus();
            return () => {
                cancelled = true;
                if (pollTimer) clearTimeout(pollTimer);
            };
        }

        // --- NORMAL EDIT INITIALIZATION ---
        const adj = invoiceToEdit.ledgerAdjustment ?? 0;
        // Backend convention: positive adj = subtract from total, negative adj = add to total
        setPartyLedger((invoiceToEdit.partyLedger as any) || null);
        setLedgerAdjustment(Math.abs(adj));
        setAdjustmentSign(adj >= 0 ? '-' : '+');
        setLedgerNote(invoiceToEdit.ledgerNote || '');

        const formItems: PurchaseItemFormData[] = invoiceToEdit.items.map(it => ({
            productId: it.masterProductId || '',
            productName: it.customProductName || it.product?.name || '',
            isCustom: it.isCustomProduct,
            hsnCode: it.hsnCode || '',
            batchNo: it.batchNo,
            expiryDate: normalizeExpiry(it.expiryDate || ''),
            // The pack size FROZEN on the invoice. Swapping in the product's current pack size re-labelled stored
            // quantities (20 loose units became 20 packs of 10) so saving an edit multiplied the stock.
            pkg: it.pkg,
            catalogPkg: (it as any).productPackSize || undefined,
            packUnitLabel: it.packUnitLabel || it.product?.packUnit || '',
            qty: it.qty,
            freeQty: it.freeQty,
            purchaseRate: it.purchaseRate,
            freightPerUnit: (it as any).freightPerUnit || 0,
            otherCostPerUnit: (it as any).otherCostPerUnit || 0,
            discountPct: it.discountPct,
            cashDiscountPct: it.cashDiscountPct,
            gstRate: it.gstRate,
            cess: it.cess,
            mrp: it.mrp,
            ptr: it.ptr || 0,
            pts: it.pts || 0,
            saleRate: it.saleRate || 0,
        }));
        setItems(formItems);

        reset({
            partyLedgerId: invoiceToEdit.partyLedgerId || '',
            purchaseType: invoiceToEdit.purchaseType as 'cash' | 'credit',
            invoiceNo: invoiceToEdit.invoiceNo,
            invoiceDate: invoiceToEdit.invoiceDate.split('T')[0],
            dueDate: invoiceToEdit.dueDate ? invoiceToEdit.dueDate.split('T')[0] : undefined,
            purchaseOrderRef: invoiceToEdit.purchaseOrderRef || '',
            godown: (invoiceToEdit.godown as string) || 'main',
            freight: invoiceToEdit.freight || 0,
            invoiceDiscount: (invoiceToEdit as any).invoiceDiscount || 0,
            notes: invoiceToEdit.notes || '',
            items: formItems,
        });
    }, [invoiceToEdit, reset, outlet?.id, ocrRetrySequence]);

    const retryOcr = async () => {
        if (!invoiceToEdit || invoiceToEdit.status !== 'SAVED' || !outlet?.id) return;
        const hasManualEntries = isDirty || !!partyLedger || items.some((item) =>
            !!item.productId || !!item.productName || !!item.batchNo || !!item.qty || !!item.purchaseRate
        );
        if (hasManualEntries && !window.confirm('Replace your current purchase entries with the scanned invoice if retry succeeds?')) return;
        setOcrStatus('processing');
        setOcrError('');
        try {
            await api.post(`/purchases/${invoiceToEdit.id}/ocr-retry/`, { outletId: outlet.id });
            setOcrRetrySequence((current) => current + 1);
        } catch (err: any) {
            setOcrStatus('error');
            setOcrError(err.error?.message || 'Could not restart invoice scanning. Please try again.');
        }
    };


    // ── Receive against a purchase order ─────────────────────────────────────
    // Fills the party and the lines still owed (remaining quantity). The user still enters batch, expiry and the real rate.
    const loadPo = useCallback(async (id: string) => {
        try {
            const po = await poApi.get(outletId!, id);
            if (po.status !== 'SENT' && po.status !== 'PARTIAL') {
                toast({ variant: 'destructive', title: `${po.poNumber} is ${po.statusLabel}`, description: 'Goods can only be received against a Sent or Partial order.' });
                return;
            }
            setLinkedPo({ id: po.id, poNumber: po.poNumber });
            setValue('purchaseOrderRef', po.poNumber);
            if (po.distributorLedger) {
                setPartyLedger(po.distributorLedger);
                setValue('partyLedgerId', po.distributorLedger.id, { shouldValidate: true });
            }
            const owed = po.items.filter((it) => it.remainingQty > 0).map((it) => ({
                ...emptyItem(), productId: it.productId, productName: it.productName,
                qty: it.remainingQty, purchaseRate: Number(it.estRate), ptr: Number(it.estRate),
            }));
            if (owed.length > 0) {
                setItems(owed);
                toast({ title: `Filled from ${po.poNumber}`, description: `${owed.length} line${owed.length > 1 ? 's' : ''} still to receive. Enter batch, expiry and the invoice rate.` });
            }
        } catch (e: any) {
            toast({ title: 'Could not load the purchase order', description: e?.message, variant: 'destructive' });
        }
    }, [outletId, setValue, toast]);

    useEffect(() => { if (poId && outletId && !invoiceToEdit) loadPo(poId); }, [poId, outletId, invoiceToEdit, loadPo]);

    // Open orders from the chosen distributor: offer to link one
    const distributorId = (partyLedger as any)?.linkedDistributorId as string | undefined;
    const { data: openPos } = useOpenPOs(!linkedPo && !invoiceToEdit ? distributorId : null);


    // ── Draft ────────────────────────────────────────────────────────────────

    useEffect(() => {
        try { if (draftKey && localStorage.getItem(draftKey)) setHasDraft(true); } catch { /* ignore */ }
    }, [draftKey]);

    const restoreDraft = () => {
        if (!draftKey) return;
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return;
            const { formValues, savedItems } = JSON.parse(raw);
            reset(formValues);
            setItems(savedItems);
            setHasDraft(false);
            toast({ title: 'Draft restored ✓' });
        } catch { localStorage.removeItem(draftKey); }
    };

    /** Throw the saved draft away (leaving the screen on purpose, without keeping it) */
    const discardDraft = () => {
        if (draftKey) { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } }
        setHasDraft(false);
    };

    const saveDraft = useCallback(() => {
        if (!draftKey) return;
        try {
            localStorage.setItem(draftKey, JSON.stringify({ formValues: watch(), savedItems: items }));
            toast({ title: 'Draft saved' });
        } catch { /* ignore */ }
    }, [draftKey, watch, items, toast]);


    // Auto-save every 30 s while dirty
    useEffect(() => {
        if (!isDirty || !draftKey) return;
        const id = setInterval(() => {
            try {
                localStorage.setItem(draftKey, JSON.stringify({ formValues: watch(), savedItems: items }));
            } catch { /* ignore */ }
        }, 30_000);
        return () => clearInterval(id);
    }, [isDirty, draftKey, items, watch]);

    // ── Item handlers ────────────────────────────────────────────────────────

    const handleItemChange = (index: number, field: keyof PurchaseItemFormData, value: string | number) => {
        if (field === 'pkg') {
            packAckRef.current = false;                       // a changed PKG is asked about again
            if (pkgServerIssue?.index === index) setPkgServerIssue(null);
            clearErrors(`items.${index}.pkg` as any);
        }
        setItems((prev) => {
            const next = prev.map((item, i) => i === index ? { ...item, [field]: value } : item);
            setValue('items', next);
            return next;
        });
    };

    const handleAddItem = () => {
        setItems((prev) => { const next = [...prev, emptyItem()]; setValue('items', next); return next; });
    };

    /** Put a removed medicine back where it was (the toast's Undo) */
    const restoreItem = (index: number, item: PurchaseItemFormData) => {
        setItems((prev) => {
            const result = prev.length === 1 && !isStartedLine(prev[0])
                ? [item]                                         // the list had been left with one blank row
                : [...prev.slice(0, index), item, ...prev.slice(index)];
            setValue('items', result);
            return result;
        });
    };

    const handleRemoveItem = (index: number) => {
        const removed = items[index];
        setItems((prev) => {
            const next = prev.filter((_, i) => i !== index);
            const result = next.length ? next : [emptyItem()];
            setValue('items', result);
            return result;
        });
        // taking out a medicine somebody typed in is not final: offer to put it back (a blank row needs no undo)
        if (removed && isStartedLine(removed)) {
            toast({
                title: 'Medicine removed',
                description: removed.productName || undefined,
                action: createElement(ToastAction, { altText: 'Undo: put the medicine back', onClick: () => restoreItem(index, removed) }, 'Undo') as unknown as ToastActionElement,
            });
        }
    };

    // ── Live totals ──────────────────────────────────────────────────────────

    // GST mode: interstate if the party's state is set and differs from the outlet's
    const partyState = partyLedger?.state || '';
    const isInterstate = isInterstateSupply(partyState, outletState);

    const {
        goodsValue, totalTradeDisc, totalCashDisc, invoiceDiscount, invoiceDiscountPct, taxableValue, totalGST, totalCess,
        sgst, cgst, igst, freight, preRound, roundOff, computedTotal, effectiveAdjustment, netPayable, totalUnits,
    } = computePurchaseTotals({ items, invoiceDiscount: watchedInvoiceDiscount, freight: watchedFreight, isInterstate, ledgerAdjustment, adjustmentSign });
    // typed-in work that would be lost by leaving: anything started on a line, or any header change
    const hasUnsavedWork = isDirty || items.some(isStartedLine);
    const nearExpiryCount = items.filter((it) => it.expiryDate && isNearExpiry(it.expiryDate)).length;

    useEffect(() => {
        if ((errors.items as any)?.type === 'manual' && items.some((it) => (it.productId && it.productId.trim() !== '') || (it.productName && it.productName.trim() !== ''))) {
            clearErrors('items' as any);
        }
    }, [items, errors.items, clearErrors]);

    // ── Validation Error & Cleanup Handlers ────────────────────────────────────

    const onInvalid = (errors: any) => {
        console.error("FORM VALIDATION ERRORS:", errors);
        let errMsg = "Please check required fields in the form";
        if (errors.partyLedgerId) {
            errMsg = errors.partyLedgerId.message || "Select the party (distributor)";
        } else if (errors.invoiceNo) {
            errMsg = errors.invoiceNo.message || "Enter the invoice number";
        } else if (errors.items && Array.isArray(errors.items) && errors.items.length > 0) {
            const firstErrIdx = errors.items.findIndex((row: any) => row && Object.keys(row).length > 0);
            if (firstErrIdx >= 0) {
                const rowErrors = errors.items[firstErrIdx];
                const failingKeys = Object.keys(rowErrors);
                const firstMsg = rowErrors[failingKeys[0]]?.message || failingKeys.join(", ");
                errMsg = `Item Row ${firstErrIdx + 1}: ${firstMsg}`;
            }
        } else if ((errors.items as any)?.message) {
            errMsg = (errors.items as any).message;
        }
        toast({
            variant: 'destructive',
            title: 'Form Validation Error',
            description: errMsg
        });
        focusFirstInvalid(errors);
    };

    /** After a refused save, put the cursor on the first thing that is wrong (the header first, then the first bad cell of the first bad row). */
    const focusFirstInvalid = (errs: any) => {
        const CELL_ORDER: Array<[string, string]> = [['productId', 'product-search'], ['productName', 'product-search'], ['batchNo', 'batch'], ['expiryDate', 'expiry'], ['pkg', 'pkg'], ['qty', 'qty'], ['purchaseRate', 'rate'], ['mrp', 'mrp']];
        requestAnimationFrame(() => {
            let target: HTMLElement | null | undefined = null;
            if (errs?.partyLedgerId) target = partyRef.current?.querySelector('input');
            else if (errs?.invoiceNo) target = invoiceNoRef.current;
            else if (Array.isArray(errs?.items)) {
                const row = errs.items.findIndex((r: any) => r && Object.keys(r).length > 0);
                if (row >= 0) {
                    const rowEl = document.querySelector(`[data-cart-row="${row}"]`);
                    const hit = CELL_ORDER.find(([key]) => errs.items[row][key]);
                    target = (hit && rowEl?.querySelector<HTMLElement>(`[data-field="${hit[1]}"]`)) || rowEl?.querySelector<HTMLElement>('input');
                }
            }
            if (target) { target.focus(); (target as HTMLInputElement).select?.(); target.scrollIntoView?.({ block: 'center' }); }
        });
    };

    const cleanItemsBeforeSubmit = () => {
        const validItems = items.filter(it => (it.productId && it.productId.trim() !== '') || (it.productName && it.productName.trim() !== ''));
        if (validItems.length === 0) {
            // Say it on the form (next to the table) and show the missing header fields too, instead of one toast that also covers the Save button
            setError('items' as any, { type: 'manual', message: 'Add at least one medicine: type a name in the Product column.' });
            void trigger(['partyLedgerId', 'invoiceNo']);
            const firstMissing = !watch('partyLedgerId') ? partyRef.current?.querySelector('input') : !watch('invoiceNo') ? invoiceNoRef.current : null;
            (firstMissing ?? document.querySelector<HTMLInputElement>('[data-field="product-search"]'))?.focus();
            return null;
        }
        if (validItems.length !== items.length) {
            setItems(validItems);
            setValue('items', validItems);
        }
        return validItems;
    };

    // ── Submit ───────────────────────────────────────────────────────────────

    /** "Save as entered" in the pack-size question: remember the yes and save again */
    const confirmPackSizes = () => {
        packAckRef.current = true;
        setPackConfirm(null);
        void handleSubmit(onSubmit, onInvalid)();
    };
    /** "Go back and check": close the question and put the cursor on the first PKG in doubt (the phone layout opens that line instead) */
    const cancelPackConfirm = () => {
        const first = packConfirm?.[0];
        setPackConfirm(null);
        if (first) requestAnimationFrame(() => {
            const cell = document.querySelector<HTMLInputElement>(`[data-cart-row="${first.index}"] [data-field="pkg"]`);
            cell?.focus(); cell?.select?.();
        });
    };

    const onSubmit = async (data: FormData) => {
        if (submitInFlightRef.current) return;
        submitInFlightRef.current = true;
        try {
            const validItems = cleanItemsBeforeSubmit();
            if (!validItems) return;

            if (invoiceToEdit && invoiceToEdit.status !== 'SAVED') {
                if (!revisionReasonCode) {
                    toast({ variant: 'destructive', title: 'Revision reason code is required.' });
                    return;
                }
                if (!revisionReasonText || revisionReasonText.length < 10) {
                    toast({ variant: 'destructive', title: 'A detailed revision reason explanation (min 10 characters) is required.' });
                    return;
                }
            }

            // A PKG that contradicts a catalogue pack size above 1 (catalogue 10 per strip, line says 15) is asked about once, listing each such line.
            // When EDITING a saved purchase, lines that already had this PKG are left out: only a changed pack size is worth asking about.
            if (!packAckRef.current) {
                const original = new Map<string, number>();
                if (invoiceToEdit && invoiceToEdit.status !== 'SAVED') {
                    for (const it of invoiceToEdit.items) original.set(`${it.masterProductId || ''}|${it.batchNo}`, Number(it.pkg));
                }
                const mismatches = packMismatches(validItems, original.size
                    ? (it) => original.get(`${it.productId}|${it.batchNo}`) === Number(it.pkg)
                    : undefined);
                if (mismatches.length) { setPackConfirm(mismatches); return; }
            }

            const payload = buildPurchasePayload(
                data,
                validItems,
                outletId!,
                goodsValue,
                totalTradeDisc,
                totalCashDisc,
                taxableValue,
                totalGST,
                totalCess,
                roundOff,
                effectiveAdjustment,
                ledgerNote,
                netPayable,
                invoiceToEdit ? revisionReasonCode : undefined,
                invoiceToEdit ? revisionReasonText : undefined
            );

            if (linkedPo && !invoiceToEdit) payload.purchaseOrderId = linkedPo.id;

            if (invoiceToEdit && invoiceToEdit.status !== 'SAVED') {
                await updatePurchase.mutateAsync({ id: invoiceToEdit.id, payload });
                toast({
                    title: 'Purchase updated ✓',
                    description: `Invoice ${data.invoiceNo} has been modified successfully.`,
                });
            } else if (invoiceToEdit && invoiceToEdit.status === 'SAVED') {
                await confirmDraft.mutateAsync({ id: invoiceToEdit.id, payload });
                if (draftKey) localStorage.removeItem(draftKey);
                toast({
                    title: 'Purchase saved ✓',
                    description: `Invoice ${data.invoiceNo} — ${validItems.length} item${validItems.length !== 1 ? 's' : ''}, ${totalUnits} units added to stock.`,
                });
            } else {
                await createPurchase.mutateAsync(payload);
                if (draftKey) localStorage.removeItem(draftKey);
                toast({
                    title: 'Purchase saved ✓',
                    description: `Invoice ${data.invoiceNo} — ${validItems.length} item${validItems.length !== 1 ? 's' : ''}, ${totalUnits} units added to stock.`,
                });
            }

            packAckRef.current = false;
            onSuccess(invoiceToEdit?.id);
        } catch (err: any) {
            console.error("PURCHASE SUBMISSION ERROR:", err);
            packAckRef.current = false;
            const code = err?.error?.code;
            const line = err?.error?.itemIndex;
            if ((code === 'INVALID_PKG' || code === 'PACK_SIZE_CONFLICT') && typeof line === 'number') {
                // the server refused this line's pack size: mark that line's PKG and say why
                const message = err.error.message as string;
                setPkgServerIssue({ index: line, message });
                setError(`items.${line}.pkg` as any, { type: 'server', message });
                toast({ variant: 'destructive', title: code === 'PACK_SIZE_CONFLICT' ? 'Pack size conflicts with stock' : 'Check the pack size (Pkg)', description: message });
                requestAnimationFrame(() => {
                    const cell = document.querySelector<HTMLInputElement>(`[data-cart-row="${line}"] [data-field="pkg"]`);
                    cell?.focus(); cell?.select?.();
                });
            } else if (code === 'DUPLICATE_INVOICE') {
                setError('invoiceNo', { message: err.error.message });
            } else if (code === 'EMPTY_ITEMS') {
                toast({ variant: 'destructive', title: 'Add at least one item' });
            } else {
                const msg = err?.error?.message ?? err?.message ?? err?.detail ?? 'Failed to save purchase';
                toast({ variant: 'destructive', title: 'Submission Failed', description: msg });
            }
        } finally {
            submitInFlightRef.current = false;
        }
    };

    return {
        activeDrawerRow,
        adjustmentSign,
        cgst,
        cleanItemsBeforeSubmit,
        clearErrors,
        computedTotal,
        confirmDraft,
        createPurchase,
        creditDays,
        dateRef,
        distributorId,
        draftKey,
        drawerInitialName,
        drawerOpen,
        duplicateInvoiceQuery,
        effectiveAdjustment,
        errors,
        formRef,
        freight,
        goodsValue,
        gridContainerRef,
        handleAddItem,
        handleItemChange,
        handleOpenAddProduct,
        handleProductCreated,
        handleRemoveItem,
        handleSelectProduct,
        handleSubmit,
        hasDraft,
        igst,
        invoiceDiscount,
        invoiceDiscountPct,
        invoiceNoRef,
        isDirty,
        isDuplicate,
        isInterstate,
        hasUnsavedWork,
        discardDraft,
        packConfirm,
        confirmPackSizes,
        cancelPackConfirm,
        pkgServerIssue,
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
        ocrRetrySequence,
        ocrReviewNotes,
        ocrStatus,
        onInvalid,
        onSubmit,
        openPos,
        outlet,
        outletId,
        outletState,
        partyLedger,
        partyRef,
        partyState,
        poId,
        poRef,
        preRound,
        register,
        reset,
        restoreDraft,
        retryOcr,
        revisionReasonCode,
        revisionReasonText,
        roundOff,
        saveDraft,
        scannedImage,
        scannedImageModalOpen,
        scannedPages,
        scannedPageSizes,
        searchParams,
        setActiveDrawerRow,
        setAdjustmentSign,
        setCreditDays,
        setDrawerInitialName,
        setDrawerOpen,
        setError,
        setHasDraft,
        setItems,
        setLedgerAdjustment,
        setLedgerNote,
        setLinkedPo,
        setOcrError,
        setOcrNeedsReview,
        setOcrRetrySequence,
        setOcrReviewNotes,
        setOcrStatus,
        setPartyLedger,
        setRevisionReasonCode,
        setRevisionReasonText,
        setScannedImage,
        setScannedImageModalOpen,
        setScannedPages,
        setValue,
        sgst,
        taxableValue,
        totalCashDisc,
        totalCess,
        totalGST,
        totalTradeDisc,
        totalUnits,
        trigger,
        updatePurchase,
        user,
        watch,
        watchedFreight,
        watchedInvoiceDate,
        watchedInvoiceDiscount,
        watchedInvoiceNo,
        watchedPartyLedgerId,
        watchedPurchaseType,
    };
}

export type PurchaseEntry = ReturnType<typeof usePurchaseEntry>;
