'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMagicSubmit } from '@/hooks/useMagicSubmit';
import { useEnterNavigation } from '@/hooks/useEnterNavigation';
import { useGridNavigation } from '@/hooks/useGridNavigation';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'next/navigation';
import { API_URL, getHeaders } from '@/lib/apiClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, addDays, differenceInDays } from 'date-fns';
import { Plus, AlertTriangle, Save, X, FileText, Calculator, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { api } from '@/lib/api';
// Note: Select still used for Purchase Type / Godown dropdowns
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCreatePurchase, useUpdatePurchase, useCheckDuplicateInvoice, useConfirmDraft } from '@/hooks/usePurchases';
import { LedgerPicker } from '@/components/accounts/LedgerPicker';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { PurchaseItemRow, PURCHASE_ITEM_COLS } from './PurchaseItemRow';
import { AddNewProductDrawer } from './AddNewProductDrawer';
import { PurchaseItemFormData, ProductSearchResult, Ledger, PurchaseInvoiceFull } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';
import { buildPurchasePayload, normalizeExpiryDate } from '@/utils/payloadBuilders';

export const normalizeExpiry = normalizeExpiryDate;

const purchaseGridHeaderCell = 'border-r border-b-2 border-[#D8DEE8] border-b-slate-300 bg-slate-100 px-1.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700';

// ─── Schema ───────────────────────────────────────────────────────────────────

const safeNumber = (minVal = 0, defaultVal = 0) =>
    z.preprocess(
        (val) => (val === '' || val === null || val === undefined || Number.isNaN(Number(val)) ? defaultVal : Number(val)),
        z.number().min(minVal)
    );

const safePositiveNumber = (errMsg: string) =>
    z.preprocess(
        (val) => (val === '' || val === null || val === undefined || Number.isNaN(Number(val)) ? 0 : Number(val)),
        z.number().positive(errMsg)
    );

const itemSchema = z.object({
    productId: z.string().min(1, 'Product selection from catalog is required'),
    isCustom: z.boolean().default(false),
    productName: z.string().min(1, 'Product name required'),
    hsnCode: z.string().optional().default(''),
    batchNo: z.string().min(1, 'Batch required'),
    expiryDate: z.string().min(1, 'Expiry required').refine((val) => {
        const norm = normalizeExpiry(val);
        return /^\d{4}-\d{2}-\d{2}$/.test(norm);
    }, 'Invalid expiry format (use MM/YY or MM/YYYY)'),
    pkg: safeNumber(1, 1),
    qty: safePositiveNumber('Qty must be > 0'),
    freeQty: safeNumber(0, 0),
    purchaseRate: safePositiveNumber('Rate must be > 0'),
    discountPct: safeNumber(0, 0),
    cashDiscountPct: safeNumber(0, 0),
    gstRate: safeNumber(0, 0),
    cess: safeNumber(0, 0),
    mrp: safePositiveNumber('MRP required'),
    ptr: safeNumber(0, 0),
    pts: safeNumber(0, 0),
    saleRate: safeNumber(0, 0),
});

const schema = z.object({
    partyLedgerId: z.string().min(1, 'Select a party ledger'),
    purchaseType: z.enum(['credit', 'cash']),
    invoiceNo: z.string().min(1, 'Invoice No required'),
    invoiceDate: z.string(),
    dueDate: z.string().optional(),
    purchaseOrderRef: z.string().optional(),
    godown: z.string().optional(),
    freight: safeNumber(0, 0),
    invoiceDiscount: safeNumber(0, 0),
    notes: z.string().optional(),
    items: z.array(itemSchema).min(1, 'Add at least one item'),
});

type FormData = z.infer<typeof schema>;

// ─── Constants ────────────────────────────────────────────────────────────────

const GODOWNS = [
    { value: 'main', label: 'Main Store' },
    { value: 'cold_storage', label: 'Cold Storage' },
    { value: 'secondary', label: 'Secondary Store' },
];
const today = format(new Date(), 'yyyy-MM-dd');
const defaultDue = format(addDays(new Date(), 30), 'yyyy-MM-dd');

export const emptyItem = (): PurchaseItemFormData => ({
    productId: '', productName: '', isCustom: false, hsnCode: '',
    batchNo: '', expiryDate: '',
    pkg: '' as unknown as number, packUnitLabel: '', qty: 0, freeQty: 0,
    purchaseRate: 0, freightPerUnit: 0, otherCostPerUnit: 0, discountPct: 0, cashDiscountPct: 0,
    gstRate: 12, cess: 0,
    mrp: 0, ptr: 0, pts: 0, saleRate: 0,
});

// ─── Helper ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ocrNumber = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const isNearExpiry = (exp: string) => {
    const norm = normalizeExpiry(exp);
    return norm ? differenceInDays(new Date(norm), new Date()) < 90 : false;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function NewPurchaseForm({ onSuccess, invoiceToEdit }: { onSuccess: (updatedInvoiceId?: string) => void, invoiceToEdit?: PurchaseInvoiceFull | null }) {
    const searchParams = useSearchParams();
    const poId = searchParams?.get('poId');
    const [linkedPoNo, setLinkedPoNo] = useState<string | null>(null);

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

    // Refs for enter navigation
    const partyRef = useRef<HTMLDivElement>(null);
    const invoiceNoRef = useRef<HTMLInputElement | null>(null);
    const dateRef = useRef<HTMLInputElement | null>(null);
    const poRef = useRef<HTMLInputElement | null>(null);
    const notesRef = useRef<HTMLTextAreaElement | null>(null);
    const gridContainerRef = useRef<HTMLDivElement>(null);

    useEnterNavigation([partyRef, invoiceNoRef, dateRef, poRef, notesRef, gridContainerRef]);
    useGridNavigation(gridContainerRef, () => handleAddItem());

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
    const [ocrRetrySequence, setOcrRetrySequence] = useState(0);
    const [scannedImage, setScannedImage] = useState<string | null>(null);
    const [scannedImageModalOpen, setScannedImageModalOpen] = useState(false);

    const handleOpenAddProduct = (rowIndex: number, name: string) => {
        setActiveDrawerRow(rowIndex);
        setDrawerInitialName(name);
        setDrawerOpen(true);
    };

    const handleSelectProduct = (rowIndex: number, product: ProductSearchResult) => {
        const firstBatch = product.batches?.[0];
        const mrp = firstBatch?.mrp ?? product.mrp ?? 0;
        const saleRate = firstBatch?.saleRate ?? product.saleRate ?? 0;
        const gstRate = product.gstRate ?? 0;
        setItems((prev) => prev.map((item, i) => {
            if (i !== rowIndex) return item;
            const newPkg = typeof product.packSize === 'number' && product.packSize > 0 ? product.packSize : ('' as unknown as number);
            return {
                ...item,
                productId: product.id,
                productName: product.name,
                isCustom: false,
                hsnCode: product.hsnCode ?? item.hsnCode,
                pkg: newPkg,
                packUnitLabel: product.packUnit || '',
                gstRate,
                mrp,
                saleRate,
            };
        }));
    };

    const handleProductCreated = (product: ProductSearchResult) => {
        handleSelectProduct(activeDrawerRow, product);
        toast({ title: 'Product added successfully' });
    };


    const {
        register, handleSubmit, setValue, setError,
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
            invoiceDate: today,
            dueDate: defaultDue,
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
            setScannedImage(null);
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
                            pkg: ocrNumber(item.medicineMatch?.packSize ?? item.medicineMatch?.pack_size ?? item.packSize) || 1,
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
                        }));

                        setItems(formItems.length ? formItems : [emptyItem()]);
                        const reviewNotes: string[] = [];
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
            pkg: (it.pkg === 1 && it.product?.packSize) ? it.product.packSize : it.pkg,
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


    // ── Autofill from PO Logic ───────────────────────────────────────────────
    useEffect(() => {
        if (poId && outletId && !invoiceToEdit) {
            fetch(`${API_URL}/purchases/orders/${poId}/?outletId=${outletId}`, {
                headers: getHeaders()
            })
                .then(res => {
                    if (!res.ok) throw new Error('PO fetch failed');
                    return res.json();
                })
                .then(data => {
                    if (data && data.items) {
                        setLinkedPoNo(data.poNumber);
                        setValue('purchaseOrderRef', data.id); // Save PO ID so backend can mark it

                        const newItems = data.items.map((it: any) => {
                            const remainingQty = it.qtyStrips - it.receivedQty;
                            if (remainingQty <= 0) return null;

                            return {
                                ...emptyItem(),
                                productId: it.productId,
                                productName: it.productName,
                                qty: remainingQty,
                                purchaseRate: it.lastRate,
                                ptr: it.lastRate,
                            };
                        }).filter(Boolean);

                        if (newItems.length > 0) {
                            setItems(newItems);
                            toast({ title: 'PO Data Loaded', description: `Pre-filled ${newItems.length} items from ${data.poNumber}.` });
                        }
                    }
                })
                .catch(err => {
                    console.error("Failed to fetch PO", err);
                    toast({ title: 'Error', description: 'Failed to load PO data.', variant: 'destructive' });
                });
        }
    }, [poId, outletId, invoiceToEdit, setValue, toast]);


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
        setItems((prev) => {
            const next = prev.map((item, i) => i === index ? { ...item, [field]: value } : item);
            setValue('items', next);
            return next;
        });
    };

    const handleAddItem = () => {
        setItems((prev) => { const next = [...prev, emptyItem()]; setValue('items', next); return next; });
    };

    const handleRemoveItem = (index: number) => {
        setItems((prev) => {
            const next = prev.filter((_, i) => i !== index);
            const result = next.length ? next : [emptyItem()];
            setValue('items', result);
            return result;
        });
    };

    // ── Live totals ──────────────────────────────────────────────────────────

    const getEffPkg = (val: any) => typeof val === 'number' && val > 0 ? val : 1;

    const goodsValue = items.reduce((s, it) => s + it.qty * it.purchaseRate, 0);
    const totalTradeDisc = items.reduce((s, it) => s + it.qty * it.purchaseRate * (it.discountPct / 100), 0);
    const totalCashDisc = items.reduce((s, it) => {
        const afterTrade = it.qty * it.purchaseRate * (1 - it.discountPct / 100);
        return s + afterTrade * (it.cashDiscountPct / 100);
    }, 0);

    const preInvoiceDiscountBase = goodsValue - totalTradeDisc - totalCashDisc;
    const invoiceDiscount = Number(watchedInvoiceDiscount) || 0;
    const invoiceDiscountPct = preInvoiceDiscountBase > 0 ? (invoiceDiscount / preInvoiceDiscountBase) : 0;

    const taxableValue = preInvoiceDiscountBase - invoiceDiscount;

    const totalGST = items.reduce((s, it) => {
        const base = it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100);
        const baseAfterInvoiceDisc = base * (1 - invoiceDiscountPct);
        return s + baseAfterInvoiceDisc * (it.gstRate / 100);
    }, 0);
    const totalCess = items.reduce((s, it) => {
        const base = it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100);
        const baseAfterInvoiceDisc = base * (1 - invoiceDiscountPct);
        return s + baseAfterInvoiceDisc * (it.cess / 100);
    }, 0);

    // ── GST mode: interstate if partyLedger.state is set and != outlet state ──
    const partyState = partyLedger?.state || '';
    const isInterstate = !!(partyState && outletState &&
        partyState.trim().toLowerCase() !== outletState.trim().toLowerCase());

    const sgst = !isInterstate ? totalGST / 2 : 0;
    const cgst = !isInterstate ? totalGST / 2 : 0;
    const igst = isInterstate ? totalGST : 0;
    const freight = Number(watchedFreight) || 0;
    const preRound = taxableValue + totalGST + totalCess + freight;
    const roundOff = Math.round(preRound) - preRound;
    const computedTotal = preRound + roundOff;

    // + sign means addition (increase bill -> negative payload required for backend minus)
    // - sign means deduction (reduce bill -> positive payload required for backend minus)
    const effectiveAdjustment = ledgerAdjustment * (adjustmentSign === '-' ? 1 : -1);
    const netPayable = computedTotal - effectiveAdjustment;

    const totalUnits = items.reduce((s, it) => {
        return s + it.qty * getEffPkg(it.pkg);
    }, 0);
    const nearExpiryCount = items.filter((it) => it.expiryDate && isNearExpiry(it.expiryDate)).length;

    // ── Validation Error & Cleanup Handlers ────────────────────────────────────

    const onInvalid = (errors: any) => {
        console.error("FORM VALIDATION ERRORS:", errors);
        let errMsg = "Please check required fields in the form";
        if (errors.partyLedgerId) {
            errMsg = errors.partyLedgerId.message || "Select a party ledger";
        } else if (errors.invoiceNo) {
            errMsg = errors.invoiceNo.message || "Invoice No is required";
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
    };

    const cleanItemsBeforeSubmit = () => {
        const validItems = items.filter(it => (it.productId && it.productId.trim() !== '') || (it.productName && it.productName.trim() !== ''));
        if (validItems.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Validation Error',
                description: 'Please add at least one product to the purchase invoice.'
            });
            return null;
        }
        if (validItems.length !== items.length) {
            setItems(validItems);
            setValue('items', validItems);
        }
        return validItems;
    };

    // ── Submit ───────────────────────────────────────────────────────────────

    const onSubmit = async (data: FormData) => {
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

            onSuccess(invoiceToEdit?.id);
        } catch (err: any) {
            console.error("PURCHASE SUBMISSION ERROR:", err);
            const code = err?.error?.code;
            if (code === 'DUPLICATE_INVOICE') {
                setError('invoiceNo', { message: err.error.message });
            } else if (code === 'EMPTY_ITEMS') {
                toast({ variant: 'destructive', title: 'Add at least one item' });
            } else {
                const msg = err?.error?.message ?? err?.message ?? err?.detail ?? 'Failed to save purchase';
                toast({ variant: 'destructive', title: 'Submission Failed', description: msg });
            }
        }
    };

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
                        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                        <h2 className="text-lg font-semibold text-slate-800">Analyzing Scanned Invoice</h2>
                        <p className="text-sm text-slate-500 mt-2">Extracting items, batches, and prices...</p>
                    </div>
                )}

                {ocrStatus === 'error' && (
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                        <p className="flex-1 text-sm text-red-800">
                            Invoice scan failed: {ocrError}
                        </p>
                        {invoiceToEdit?.status === 'SAVED' && <Button type="button" size="sm" variant="outline" onClick={retryOcr}>Retry scan</Button>}
                        <Button type="button" size="sm" variant="outline" onClick={() => setOcrStatus('idle')}>Dismiss</Button>
                    </div>
                )}

                {ocrStatus === 'ready' && ocrReviewNotes.length > 0 && (
                    <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
                        <p className="font-semibold">Review the scanned invoice before saving</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                            {ocrReviewNotes.slice(0, 5).map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
                            {ocrReviewNotes.length > 5 && <li>{ocrReviewNotes.length - 5} more fields need review.</li>}
                        </ul>
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
                                <ImageIcon className="h-4 w-4" />
                                View Scanned Invoice
                            </Button>
                        </div>
                        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                            <DialogHeader>
                                <DialogTitle>Scanned Invoice Image</DialogTitle>
                            </DialogHeader>
                            <div className="flex-1 overflow-auto bg-slate-100 rounded-md border border-border flex items-center justify-center p-4">
                                {/* Use standard img tag instead of next/image since the URL is external/django */}
                                <img
                                    src={scannedImage}
                                    alt="Scanned Invoice"
                                    className="max-w-full max-h-full object-contain"
                                />
                            </div>
                        </DialogContent>
                    </Dialog>
                )}

                {linkedPoNo && (
                    <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-3 rounded-lg flex items-center gap-3">
                        <FileText className="w-5 h-5 text-indigo-500" />
                        <span className="font-medium">🔗 Linked to {linkedPoNo}</span>
                        <span className="text-sm opacity-80">Line items have been automatically populated based on remaining quantities.</span>
                    </div>
                )}

                {/* ── Draft banner ────────────────────────────────────────── */}
                {hasDraft && (
                    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <FileText className="h-4 w-4 shrink-0 text-amber-600" />
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

                {/* ── Near-expiry warning ──────────────────────────────────── */}
                {nearExpiryCount > 0 && (
                    <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
                        <p className="text-sm text-orange-700">
                            <span className="font-semibold">{nearExpiryCount} item{nearExpiryCount > 1 ? 's' : ''}</span> expiring within 90 days — verify with distributor before accepting.
                        </p>
                    </div>
                )}

                <section aria-label="Invoice details" className="border-b border-slate-300 bg-white">
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2 px-1 py-1.5 sm:grid-cols-2 lg:grid-cols-[minmax(270px,1.9fr)_minmax(160px,1fr)_minmax(150px,0.85fr)_minmax(130px,0.75fr)]">
                        <div className="min-w-0 space-y-0.5">
                            <Label className="text-[11px] font-medium leading-none text-slate-600">Party <span className="text-red-500">*</span></Label>
                            <div className="w-full min-w-0" ref={partyRef}>
                                <LedgerPicker
                                    group="Sundry Creditors"
                                    value={partyLedger}
                                    onChange={(l) => {
                                        setPartyLedger(l);
                                        setValue('partyLedgerId', l?.id ?? '', { shouldValidate: true });
                                    }}
                                    placeholder="Select party ledger..."
                                    className={cn("h-8 text-sm [&_input]:h-8", errors.partyLedgerId && "ring-1 ring-red-400 rounded-md")}
                                />
                                {errors.partyLedgerId && <p className="text-[11px] text-red-500 mt-1">{errors.partyLedgerId.message}</p>}
                            </div>
                        </div>
                        <div className="min-w-0 space-y-0.5">
                            <Label className="text-[11px] font-medium leading-none text-slate-600">Invoice No <span className="text-red-500">*</span></Label>
                            <div className="w-full min-w-0">
                                {(() => {
                                    const { ref: formRef, ...rest } = register('invoiceNo');
                                    return (
                                        <Input
                                            ref={(e) => {
                                                invoiceNoRef.current = e;
                                                formRef(e);
                                            }}
                                            className={cn("h-8 border-slate-300 bg-white text-sm focus-visible:ring-violet-400", (errors.invoiceNo || isDuplicate) && "border-red-400 focus-visible:ring-red-400")}
                                            {...rest}
                                            placeholder="e.g. AJD-2026-0123"
                                        />
                                    );
                                })()}
                                {errors.invoiceNo ? (
                                    <p className="text-[11px] text-red-500 mt-1">{errors.invoiceNo.message}</p>
                                ) : isDuplicate ? (
                                    <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1">
                                        <AlertTriangle className="h-3 w-3" /> Duplicate!
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        <div className="min-w-0 space-y-0.5">
                            <Label className="text-[11px] font-medium leading-none text-slate-600">Invoice Date</Label>
                            <div className="w-full min-w-0">
                                {(() => {
                                    const { ref: formRef, ...rest } = register('invoiceDate');
                                    return (
                                        <Input
                                            className="h-8 border-slate-300 bg-white text-sm focus-visible:ring-violet-400"
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
                            <Label className="text-[11px] font-medium leading-none text-slate-600">Purchase type <span className="text-red-500">*</span></Label>
                            <div className="w-full min-w-0">
                                <Select
                                    defaultValue="credit"
                                    onValueChange={(v) => {
                                        setValue('purchaseType', v as 'cash' | 'credit');
                                        if (v === 'cash') setValue('dueDate', undefined);
                                        else setValue('dueDate', defaultDue);
                                    }}
                                >
                                    <SelectTrigger className="h-8 border-slate-300 bg-white text-sm focus-visible:ring-violet-400">
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
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 bg-slate-50/50 px-1 py-1.5">
                        <div className="flex min-w-[190px] flex-1 items-center gap-2">
                            <Label className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-none text-slate-600">Godown</Label>
                            <div className="min-w-0 flex-1">
                                <Select defaultValue="main" onValueChange={(v) => setValue('godown', v)}>
                                    <SelectTrigger className="h-8 border-slate-300 bg-white text-sm focus-visible:ring-violet-400">
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
                            <div className="flex min-w-[190px] flex-1 items-center gap-2">
                                <Label className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-none text-slate-600">Credit Days</Label>
                                <div className="min-w-0 flex-1">
                                    <Select
                                        value={Number.isFinite(creditDays) ? creditDays.toString() : "30"}
                                        onValueChange={(val) => {
                                            const parsed = parseInt(val, 10);
                                            setCreditDays(Number.isFinite(parsed) ? parsed : 30);
                                        }}
                                    >
                                        <SelectTrigger className="h-8 border-slate-300 bg-white text-sm focus-visible:ring-violet-400">
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
                        <div className="flex min-w-[190px] flex-1 items-center gap-2">
                            <Label className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-none text-slate-600">PO Ref</Label>
                            <div className="min-w-0 flex-1">
                                {(() => {
                                    const { ref: formRef, ...rest } = register('purchaseOrderRef');
                                    return (
                                        <Input
                                            className="h-8 border-slate-300 bg-white text-sm focus-visible:ring-violet-400"
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
                        <div className="flex min-w-[190px] flex-1 items-center gap-2">
                            <Label className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-none text-slate-600">Notes</Label>
                            <div className="min-w-0 flex-1">
                                {(() => {
                                    const { ref: formRef, ...rest } = register('notes');
                                    return (
                                        <Textarea
                                            className="h-8 min-h-8 resize-y border-slate-300 bg-white py-1 text-sm focus-visible:ring-violet-400"
                                            ref={(e) => {
                                                notesRef.current = e;
                                                formRef(e);
                                            }}
                                            {...rest}
                                            placeholder="Optional notes..."
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
                            <span className="text-[11px] tabular-nums text-slate-500">{items.length} row{items.length !== 1 ? 's' : ''}</span>
                            {totalUnits > 0 && (
                                <span className="text-[11px] tabular-nums text-slate-500">
                                    {totalUnits.toLocaleString('en-IN')} units
                                </span>
                            )}
                        </div>
                        <Button
                            type="button" variant="outline" size="sm"
                            className="h-7 gap-1 rounded border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            onClick={handleAddItem}
                        >
                            <Plus className="h-3 w-3" /> Add Item
                        </Button>
                    </div>

                    {errors.items && typeof errors.items.message === 'string' && (
                        <p className="mx-5 mt-2 text-[10px] text-red-500">{errors.items.message}</p>
                    )}

                    <div className="relative max-h-[clamp(220px,calc(100dvh-465px),615px)] overflow-auto overscroll-contain" ref={gridContainerRef}>
                        <table aria-label="Purchase items" className="w-full min-w-[1308px] table-fixed border-separate border-spacing-0 text-xs">
                            <colgroup>
                                {PURCHASE_ITEM_COLS.map((col) => (
                                    <col key={col.key} style={col.key === 'product' ? undefined : { width: col.width }} />
                                ))}
                            </colgroup>
                            <thead className="sticky top-0 z-30 bg-slate-100">
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
                                    <th className={cn(purchaseGridHeaderCell, 'border-t text-right')}>Amount</th>
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
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section aria-label="Invoice adjustments" className="border-y border-slate-200 bg-white px-1 py-1">
                    <h3 className="mb-0.5 text-[11px] font-semibold text-slate-700">Invoice adjustments</h3>
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2 xl:grid-cols-[minmax(250px,1fr)_minmax(260px,1fr)_minmax(350px,2fr)]">
                        <div className="flex min-w-0 items-center gap-2">
                            <Label className="shrink-0 whitespace-nowrap text-[11px] font-medium text-slate-600">Freight / Transport (₹)</Label>
                            <Input
                                type="number" step="0.01" min="0"
                                className="h-8 min-w-0 flex-1 rounded border-slate-300 text-sm"
                                placeholder="0.00"
                                {...register('freight', { valueAsNumber: true })}
                            />
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                            <Label className="flex shrink-0 justify-between gap-1 whitespace-nowrap text-[11px] font-medium text-slate-600">
                                <span>Invoice Discount (₹)</span>
                                {invoiceDiscountPct > 0 && (
                                    <span className="text-emerald-600">{(invoiceDiscountPct * 100).toFixed(2)}%</span>
                                )}
                            </Label>
                            <Input
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
                                        className="h-8 cursor-pointer rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-300"
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
                                        min={0}
                                        // Only cap at computedTotal if it's a deduction ('-')
                                        max={adjustmentSign === '-' ? computedTotal : undefined}
                                        step="0.01"
                                        className="h-8 w-24 rounded border border-slate-300 bg-white px-2 text-right text-sm font-mono focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                                        className="h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:border-violet-500 focus:outline-none"
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
                            <FileText className="h-4 w-4" />
                            Reason for Modification
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-blue-800">Action Type / Reason Code <span className="text-rose-500">*</span></Label>
                                <select
                                    className="w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    value={revisionReasonCode}
                                    onChange={(e) => setRevisionReasonCode(e.target.value)}
                                >
                                    <option value="">Select a reason...</option>
                                    <option value="ENTRY_MISTAKE">Entry Mistake</option>
                                    <option value="RATE_CORRECTION">Rate Correction</option>
                                    <option value="QTY_CORRECTION">Quantity Correction</option>
                                    <option value="DATE_CORRECTION">Date Correction</option>
                                    <option value="SUPPLIER_REQUEST">Supplier Request</option>
                                    <option value="DUPLICATE_ENTRY_FIX">Duplicate Entry Fix</option>
                                    <option value="TAX_CORRECTION">Tax Correction</option>
                                    <option value="PAYMENT_ADJUSTMENT">Payment Adjustment</option>
                                    <option value="OTHER">Other</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-blue-800">Detailed Explanation <span className="text-rose-500">*</span></Label>
                                <Textarea
                                    className="min-h-[80px] bg-white border-blue-200 focus-visible:ring-blue-500/20"
                                    placeholder="Explain why you are modifying this purchase invoice..."
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
                            {watchedPurchaseType === 'credit' && <span className="text-[11px] text-slate-500">Due {watch('dueDate') ?? '—'}</span>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <Button type="button" variant="outline" size="sm" className="h-8 rounded border-slate-300 px-2 text-xs text-slate-700" onClick={saveDraft} title="Shortcut: Alt + S">
                                <Save className="mr-1 h-3.5 w-3.5" /> Save Draft <span className="ml-1 hidden text-[10px] text-slate-500 md:inline">Alt+S</span>
                            </Button>
                            <Button type="button" variant="outline" onClick={() => onSuccess()} className="h-8 rounded border-slate-300 px-2 text-xs">
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                onClick={(e) => {
                                    const valid = cleanItemsBeforeSubmit();
                                    if (!valid) {
                                        e.preventDefault();
                                        return;
                                    }
                                    handleSubmit(onSubmit, onInvalid)();
                                }}
                                disabled={isSubmitting}
                                className="h-8 min-w-[90px] rounded bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-800"
                                title="Shortcut: Ctrl + Enter"
                            >
                                {isSubmitting ? 'Saving...' : (invoiceToEdit && invoiceToEdit.status !== 'SAVED') ? 'Update' : 'Save'}
                                <span className="ml-1 hidden text-[10px] font-normal opacity-80 md:inline">Ctrl+Enter</span>
                            </Button>
                        </div>
                    </div>
                </footer>

            </form>

            <AddNewProductDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                initialName={drawerInitialName}
                onSuccess={handleProductCreated}
            />
        </>
    );
}
