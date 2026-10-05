'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, addDays, differenceInDays } from 'date-fns';
import { Plus, AlertTriangle, Save, X, FileText, Truck, Calculator, Boxes, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { api } from '@/lib/api';
// Note: Select still used for Purchase Type / Godown dropdowns
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCreatePurchase, useUpdatePurchase, useCheckDuplicateInvoice, useConfirmDraft } from '@/hooks/usePurchases';
import { LedgerPicker } from '@/components/accounts/LedgerPicker';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { PurchaseItemRow } from './PurchaseItemRow';
import { AddNewProductDrawer } from './AddNewProductDrawer';
import { PurchaseItemFormData, ProductSearchResult, Ledger, PurchaseInvoiceFull } from '@/types';
import { useOutletId } from '@/hooks/useOutletId';
import { buildPurchasePayload } from '@/utils/payloadBuilders';

// ─── Schema ───────────────────────────────────────────────────────────────────

const itemSchema = z.object({
    productId:       z.string().optional().default(''),
    isCustom:        z.boolean().default(false),
    productName:     z.string().min(1, 'Product name required'),
    hsnCode:         z.string().optional().default(''),
    batchNo:         z.string().min(1, 'Batch required'),
    expiryDate:      z.string().min(1, 'Expiry required'),
    pkg:             z.number().min(1, 'Pkg ≥ 1'),
    qty:             z.number().positive('Qty must be > 0'),
    freeQty:         z.number().min(0),
    purchaseRate:    z.number().positive('Rate must be > 0'),
    discountPct:     z.number().min(0).max(100),
    cashDiscountPct: z.number().min(0).max(100),
    gstRate:         z.number().min(0),
    cess:            z.number().min(0),
    mrp:             z.number().positive('MRP required'),
    ptr:             z.number().min(0),
    pts:             z.number().min(0),
    saleRate:        z.number().min(0, 'Sale rate cannot be negative').optional().default(0),
});

const schema = z.object({
    partyLedgerId:    z.string().min(1, 'Select a party ledger'),
    purchaseType:     z.enum(['credit', 'cash']),
    invoiceNo:        z.string().min(1, 'Invoice No required'),
    invoiceDate:      z.string(),
    dueDate:          z.string().optional(),
    purchaseOrderRef: z.string().optional(),
    godown:           z.string().optional(),
    freight:          z.number().min(0),
    invoiceDiscount:  z.number().min(0).optional().default(0),
    notes:            z.string().optional(),
    items:            z.array(itemSchema).min(1, 'Add at least one item'),
});

type FormData = z.infer<typeof schema>;

// ─── Constants ────────────────────────────────────────────────────────────────

const GODOWNS   = [
    { value: 'main',         label: 'Main Store' },
    { value: 'cold_storage', label: 'Cold Storage' },
    { value: 'secondary',    label: 'Secondary Store' },
];
const today      = format(new Date(), 'yyyy-MM-dd');
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

const isNearExpiry = (exp: string) =>
    exp ? differenceInDays(new Date(exp), new Date()) < 90 : false;

// ─── Component ───────────────────────────────────────────────────────────────

export function NewPurchaseForm({ onSuccess, invoiceToEdit }: { onSuccess: () => void, invoiceToEdit?: PurchaseInvoiceFull | null }) {
    const { toast }   = useToast();
    const outletId    = useOutletId();
    const outlet      = useAuthStore((s) => s.outlet);
    const user        = useAuthStore((s) => s.user);
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

    const [items,             setItems]             = useState<PurchaseItemFormData[]>([emptyItem()]);
    const [hasDraft,          setHasDraft]          = useState(false);
    const [ledgerAdjustment,  setLedgerAdjustment]   = useState<number>(0);
    const [adjustmentSign,    setAdjustmentSign]     = useState<'-' | '+'>('-');
    const [ledgerNote,        setLedgerNote]         = useState<string>('');
    const [revisionReasonCode,setRevisionReasonCode] = useState<string>('');
    const [revisionReasonText,setRevisionReasonText] = useState<string>('');

    // ── Add-product drawer state ───────────────────────────────────────────────
    const [drawerOpen,        setDrawerOpen]        = useState(false);
    const [drawerInitialName, setDrawerInitialName] = useState('');
    const [activeDrawerRow,   setActiveDrawerRow]   = useState(0);

    const [ocrStatus, setOcrStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>('idle');
    const [ocrError, setOcrError] = useState('');
    const [scannedImage, setScannedImage] = useState<string | null>(null);
    const [scannedImageModalOpen, setScannedImageModalOpen] = useState(false);

    const handleOpenAddProduct = (rowIndex: number, name: string) => {
        setActiveDrawerRow(rowIndex);
        setDrawerInitialName(name);
        setDrawerOpen(true);
    };

    const handleSelectProduct = (rowIndex: number, product: ProductSearchResult) => {
        const firstBatch = product.batches?.[0];
        const mrp      = firstBatch?.mrp      ?? product.mrp      ?? 0;
        const saleRate = firstBatch?.saleRate  ?? product.saleRate ?? 0;
        const gstRate  = product.gstRate ?? 0;
        setItems((prev) => prev.map((item, i) => {
            if (i !== rowIndex) return item;
            const newPkg = typeof product.packSize === 'number' && product.packSize > 0 ? product.packSize : ('' as unknown as number);
            return {
                ...item,
                productId:   product.id,
                productName: product.name,
                isCustom:    false,
                hsnCode:     product.hsnCode ?? item.hsnCode,
                pkg:         newPkg,
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
            purchaseType: 'credit',
            invoiceDate:  today,
            dueDate:      defaultDue,
            freight:      0,
            invoiceDiscount: 0,
            items:        [emptyItem()],
        },
    });

    const watchedPurchaseType = watch('purchaseType');
    const watchedFreight      = watch('freight') ?? 0;
    const watchedInvoiceDiscount = watch('invoiceDiscount') ?? 0;
    const watchedInvoiceNo    = watch('invoiceNo');
    const watchedPartyLedgerId = watch('partyLedgerId');
    const watchedInvoiceDate   = watch('invoiceDate');
    
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
            setScannedImage(null);
            return;
        }

        if (invoiceToEdit.status === 'DRAFT') {
            setOcrStatus('processing');
            setScannedImage(invoiceToEdit.invoiceImageUrl || null);
            
            const pollStatus = async () => {
                if (!outlet?.id) return;
                try {
                    const res = await api.get(`/purchases/${invoiceToEdit.id}/ocr-status/`, {
                        params: { outletId: outlet.id }
                    });
                    
                    if (res.data.status === 'processing') {
                        setTimeout(pollStatus, 2000);
                    } else if (res.data.status === 'ready') {
                        const ocrData = res.data;
                        setOcrStatus('ready');
                        
                        // Set the Ledger object directly so the UI updates
                        if (ocrData.header?.partyLedger) {
                            setPartyLedger(ocrData.header.partyLedger);
                        } else {
                            setPartyLedger(null);
                        }

                        const formItems: PurchaseItemFormData[] = (ocrData.items || []).map((item: any) => ({
                            productId: item.medicineMatch?.productId || '',
                            productName: item.medicineMatch?.productId ? (item.medicineMatch?.productName || item.medicineMatch?.product_name || item.name) : item.name,
                            isCustom: !item.medicineMatch?.productId,
                            hsnCode: item.medicineMatch?.hsnCode || item.medicineMatch?.hsn_code || item.hsnCode || '',
                            batchNo: item.batchNo || '',
                            expiryDate: item.expiry || '',
                            pkg: item.medicineMatch?.packSize || item.medicineMatch?.pack_size || item.packSize || 1,
                            packUnitLabel: item.medicineMatch?.packUnit || item.medicineMatch?.pack_unit || '',
                            qty: item.qty || 0,
                            freeQty: item.freeQty || 0,
                            purchaseRate: item.rate || 0,
                            freightPerUnit: 0,
                            otherCostPerUnit: 0,
                            discountPct: item.discount || 0,
                            cashDiscountPct: 0,
                            gstRate: item.medicineMatch?.gstRate || item.medicineMatch?.gst_rate || item.gstPct || 0,
                            cess: 0,
                            mrp: item.mrp || 0,
                            ptr: item.rate || 0,
                            pts: item.rate || 0,
                            saleRate: item.mrp || 0,
                        }));
                        
                        setItems(formItems.length ? formItems : [emptyItem()]);
                        
                        reset({
                            partyLedgerId: ocrData.header?.partyLedgerId || '', 
                            purchaseType: 'credit',
                            invoiceNo: ocrData.header?.invoiceNo || '',
                            invoiceDate: ocrData.header?.invoiceDate || today,
                            dueDate: defaultDue,
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
                    setOcrStatus('error');
                    setOcrError(err.response?.data?.error?.message || err.message);
                }
            };
            pollStatus();
            return;
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
            expiryDate: it.expiryDate || '',
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
    }, [invoiceToEdit, reset, outlet?.id]);



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
            const next   = prev.filter((_, i) => i !== index);
            const result = next.length ? next : [emptyItem()];
            setValue('items', result);
            return result;
        });
    };

    // ── Live totals ──────────────────────────────────────────────────────────

    const getEffPkg = (val: any) => typeof val === 'number' && val > 0 ? val : 1;

    const goodsValue     = items.reduce((s, it) => s + it.qty * it.purchaseRate, 0);
    const totalTradeDisc = items.reduce((s, it) => s + it.qty * it.purchaseRate * (it.discountPct / 100), 0);
    const totalCashDisc  = items.reduce((s, it) => {
        const afterTrade = it.qty * it.purchaseRate * (1 - it.discountPct / 100);
        return s + afterTrade * (it.cashDiscountPct / 100);
    }, 0);
    
    const preInvoiceDiscountBase = goodsValue - totalTradeDisc - totalCashDisc;
    const invoiceDiscount = Number(watchedInvoiceDiscount) || 0;
    const invoiceDiscountPct = preInvoiceDiscountBase > 0 ? (invoiceDiscount / preInvoiceDiscountBase) : 0;
    
    const taxableValue   = preInvoiceDiscountBase - invoiceDiscount;
    
    const totalGST       = items.reduce((s, it) => {
        const base = it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100);
        const baseAfterInvoiceDisc = base * (1 - invoiceDiscountPct);
        return s + baseAfterInvoiceDisc * (it.gstRate / 100);
    }, 0);
    const totalCess      = items.reduce((s, it) => {
        const base = it.qty * it.purchaseRate * (1 - it.discountPct / 100) * (1 - it.cashDiscountPct / 100);
        const baseAfterInvoiceDisc = base * (1 - invoiceDiscountPct);
        return s + baseAfterInvoiceDisc * (it.cess / 100);
    }, 0);

    // ── GST mode: interstate if partyLedger.state is set and != outlet state ──
    const partyState = partyLedger?.state || '';
    const isInterstate = !!(partyState && outletState &&
        partyState.trim().toLowerCase() !== outletState.trim().toLowerCase());

    const sgst      = !isInterstate ? totalGST / 2 : 0;
    const cgst      = !isInterstate ? totalGST / 2 : 0;
    const igst      = isInterstate  ? totalGST     : 0;
    const freight   = Number(watchedFreight) || 0;
    const preRound     = taxableValue + totalGST + totalCess + freight;
    const roundOff     = Math.round(preRound) - preRound;
    const computedTotal = preRound + roundOff;
    
    // + sign means addition (increase bill -> negative payload required for backend minus)
    // - sign means deduction (reduce bill -> positive payload required for backend minus)
    const effectiveAdjustment = ledgerAdjustment * (adjustmentSign === '-' ? 1 : -1);
    const netPayable   = computedTotal - effectiveAdjustment;

    const totalUnits = items.reduce((s, it) => {
        return s + it.qty * getEffPkg(it.pkg);
    }, 0);
    const nearExpiryCount  = items.filter((it) => it.expiryDate && isNearExpiry(it.expiryDate)).length;

    // ── Submit ───────────────────────────────────────────────────────────────

    const onSubmit = async (data: FormData) => {
        try {
            if (invoiceToEdit && invoiceToEdit.status !== 'DRAFT') {
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
                items,
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

            if (invoiceToEdit && invoiceToEdit.status !== 'DRAFT') {
                await updatePurchase.mutateAsync({ id: invoiceToEdit.id, payload });
                toast({
                    title:       'Purchase updated ✓',
                    description: `Invoice ${data.invoiceNo} has been modified successfully.`,
                });
            } else if (invoiceToEdit && invoiceToEdit.status === 'DRAFT') {
                await confirmDraft.mutateAsync({ id: invoiceToEdit.id, payload });
                if (draftKey) localStorage.removeItem(draftKey);
                toast({
                    title:       'Purchase saved ✓',
                    description: `Invoice ${data.invoiceNo} — ${items.length} item${items.length !== 1 ? 's' : ''}, ${totalUnits} units added to stock.`,
                });
            } else {
                await createPurchase.mutateAsync(payload);
                if (draftKey) localStorage.removeItem(draftKey);
                toast({
                    title:       'Purchase saved ✓',
                    description: `Invoice ${data.invoiceNo} — ${items.length} item${items.length !== 1 ? 's' : ''}, ${totalUnits} units added to stock.`,
                });
            }

            onSuccess();
        } catch (err: any) {
            const code = err?.error?.code;
            if (code === 'DUPLICATE_INVOICE') {
                setError('invoiceNo', { message: err.error.message });
            } else if (code === 'EMPTY_ITEMS') {
                toast({ variant: 'destructive', title: 'Add at least one item' });
            } else {
                toast({ variant: 'destructive', title: err?.error?.message ?? 'Failed to save purchase' });
            }
        }
    };

    // ─── JSX ─────────────────────────────────────────────────────────────────

    return (
        <>
        <form 
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    const target = e.target as HTMLElement;
                    if (target.tagName.toLowerCase() !== 'textarea') {
                        e.preventDefault();
                    }
                }
            }}
            onSubmit={handleSubmit(onSubmit, (errors) => {
            console.error("FORM VALIDATION ERRORS:", errors);
            let errMsg = "Validation failed";
            if (errors.items && Array.isArray(errors.items) && errors.items.length > 0) {
                const firstRowErrors = errors.items[0] || {};
                errMsg = "Row 1 Failing Fields: " + Object.keys(firstRowErrors).join(", ");
                alert(errMsg); // FORCE an unignorable popup!
            }
            toast({
                variant: 'destructive',
                title: 'Validation Error',
                description: errMsg
            });
        })} className="flex flex-col gap-5 relative">

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
                        OCR Failed: {ocrError}
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={() => setOcrStatus('idle')}>Dismiss</Button>
                </div>
            )}
            
            {/* View Image Dialog for Scans */}
            {scannedImage && (
                <Dialog open={scannedImageModalOpen} onOpenChange={setScannedImageModalOpen}>
                    <div className="fixed bottom-6 right-6 z-40">
                        <Button 
                            type="button"
                            size="lg"
                            className="rounded-full shadow-lg gap-2"
                            onClick={() => setScannedImageModalOpen(true)}
                        >
                            <ImageIcon className="w-5 h-5" />
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

            {/* ── Zone 1: Context Header (Top, Fixed) ───────────────────────────── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm z-30 sticky top-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
                    
                    {/* Column 1 */}
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-0">
                            <Label className="text-sm font-medium text-slate-700 w-full sm:w-1/3">Party <span className="text-red-500">*</span></Label>
                            <div className="w-full sm:w-2/3">
                                <LedgerPicker
                                    group="Sundry Creditors"
                                    value={partyLedger}
                                    onChange={(l) => {
                                        setPartyLedger(l);
                                        setValue('partyLedgerId', l?.id ?? '', { shouldValidate: true });
                                    }}
                                    placeholder="Select party ledger..."
                                    className={cn("h-10 text-sm", errors.partyLedgerId && "ring-1 ring-red-400 rounded-md")}
                                />
                                {errors.partyLedgerId && <p className="text-[11px] text-red-500 mt-1">{errors.partyLedgerId.message}</p>}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-0">
                            <Label className="text-sm font-medium text-slate-700 w-full sm:w-1/3">Godown</Label>
                            <div className="w-full sm:w-2/3">
                                <Select defaultValue="main" onValueChange={(v) => setValue('godown', v)}>
                                    <SelectTrigger className="h-10 text-sm bg-white">
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
                    </div>

                    {/* Column 2 */}
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-0">
                            <Label className="text-sm font-medium text-slate-700 w-full sm:w-1/3">Invoice No <span className="text-red-500">*</span></Label>
                            <div className="w-full sm:w-2/3">
                                <Input
                                    className={cn("h-10 text-sm bg-white", (errors.invoiceNo || isDuplicate) && "border-red-400 focus-visible:ring-red-400")}
                                    {...register('invoiceNo')}
                                    placeholder="e.g. AJD-2026-0123"
                                />
                                {errors.invoiceNo ? (
                                    <p className="text-[11px] text-red-500 mt-1">{errors.invoiceNo.message}</p>
                                ) : isDuplicate ? (
                                    <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1">
                                        <AlertTriangle className="h-3 w-3" /> Duplicate!
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-0">
                            <Label className="text-sm font-medium text-slate-700 w-full sm:w-1/3">Invoice Date</Label>
                            <div className="w-full sm:w-2/3">
                                <Input className="h-10 text-sm bg-white" type="date" {...register('invoiceDate')} />
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-0">
                            <Label className="text-sm font-medium text-slate-700 w-full sm:w-1/3">PO Ref</Label>
                            <div className="w-full sm:w-2/3">
                                <Input className="h-10 text-sm bg-white" {...register('purchaseOrderRef')} placeholder="Optional" />
                            </div>
                        </div>
                    </div>

                    {/* Column 3 */}
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-0">
                            <Label className="text-sm font-medium text-slate-700 w-full sm:w-1/3">Type <span className="text-red-500">*</span></Label>
                            <div className="w-full sm:w-2/3">
                                <Select
                                    defaultValue="credit"
                                    onValueChange={(v) => {
                                        setValue('purchaseType', v as 'cash' | 'credit');
                                        if (v === 'cash') setValue('dueDate', undefined);
                                        else              setValue('dueDate', defaultDue);
                                    }}
                                >
                                    <SelectTrigger className="h-10 text-sm bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="credit">Credit</SelectItem>
                                        <SelectItem value="cash">Cash</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        {watchedPurchaseType !== 'cash' && (
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-0">
                                <Label className="text-sm font-medium text-slate-700 w-full sm:w-1/3">Credit Days</Label>
                                <div className="w-full sm:w-2/3">
                                    <Select
                                        value={Number.isFinite(creditDays) ? creditDays.toString() : "30"}
                                        onValueChange={(val) => {
                                            const parsed = parseInt(val, 10);
                                            setCreditDays(Number.isFinite(parsed) ? parsed : 30);
                                        }}
                                    >
                                        <SelectTrigger className="h-10 text-sm bg-white border-slate-200">
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
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-0">
                            <Label className="text-sm font-medium text-slate-700 w-full sm:w-1/3 pt-0 sm:pt-2">Notes</Label>
                            <div className="w-full sm:w-2/3">
                                <Textarea
                                    className="resize-none text-sm h-10 min-h-[40px] py-2 bg-white"
                                    {...register('notes')}
                                    placeholder="Optional notes..."
                                />
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* ── Zone 2: Data Engine (Middle, Scrollable Table) ───────────────────────────── */}
            <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col mt-4">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-2">
                    <div className="flex items-center gap-2">
                        <Boxes className="h-4 w-4 text-slate-500" />
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Items</h3>
                        <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                            {items.length} row{items.length !== 1 ? 's' : ''}
                        </Badge>
                        {totalUnits > 0 && (
                            <Badge variant="outline" className="text-[11px] text-slate-500 px-1.5 py-0">
                                {totalUnits.toLocaleString('en-IN')} units
                            </Badge>
                        )}
                    </div>
                    <Button
                        type="button" variant="outline" size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={handleAddItem}
                    >
                        <Plus className="h-3 w-3" /> Add Item
                    </Button>
                </div>

                {errors.items && typeof errors.items.message === 'string' && (
                    <p className="mx-5 mt-2 text-[10px] text-red-500">{errors.items.message}</p>
                )}

                {/* Make this wrapper scrollable and force full width */}
                <div className="flex-1 overflow-auto relative">
                    <table className="w-full min-w-[1280px] text-xs border-collapse">
                        <thead className="bg-slate-50 sticky top-0 z-20 shadow-[0_1px_2px_rgb(0,0,0,0.05)]">
                            <tr>
                                <th className="sticky left-0 z-30 bg-slate-50 border-r border-b border-slate-200 w-8 px-2 py-2 text-center text-[11px] uppercase tracking-wider text-slate-500 font-semibold">#</th>
                                <th className="sticky left-8 z-30 bg-slate-50 border-r border-b border-slate-200 min-w-[200px] px-2 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Product</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold">HSN</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Batch</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Expiry</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold w-16">Pkg</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold w-20">Qty</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Free</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold w-20">Rate</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Disc%</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold">GST%</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold">MRP</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold">PTR</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold">PTS</th>
                                <th className="border-r border-b border-slate-200 px-2 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Amount</th>
                                <th className="sticky right-0 z-30 bg-slate-50 border-l border-b border-slate-200 w-8 px-2 py-2 text-center text-[11px] uppercase tracking-wider text-slate-500 font-semibold" title="Delete">Act</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
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
            </div>

            {/* ── Section C: Additional Charges & Discounts ────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <Truck className="h-4 w-4 text-slate-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Additional Charges & Invoice Discount
                    </h3>
                </div>
                <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">Freight / Transport (₹)</Label>
                        <Input
                            type="number" step="0.01" min="0"
                            className="h-9 text-sm"
                            placeholder="0.00"
                            {...register('freight', { valueAsNumber: true })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">Invoice Discount (₹)</Label>
                        <Input
                            type="number" step="0.01" min="0"
                            className="h-9 text-sm text-green-700"
                            placeholder="0.00"
                            {...register('invoiceDiscount', { valueAsNumber: true })}
                        />
                    </div>
                </div>
            </div>

            {/* ── Section D: Ledger Adjustment ────────────────────────── */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-semibold text-slate-700">Ledger Adjustment</p>
                        <p className="text-xs text-slate-400">
                            Apply credit from distributor account (return, advance, write-off)
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select 
                            className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
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
                            className="w-36 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-right text-base font-mono shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                    <div className="mt-2">
                        <input
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 focus:border-blue-400 focus:outline-none"
                            placeholder="Reason (e.g. Return CN-2024-45, Advance payment)"
                            value={ledgerNote}
                            onChange={(e) => setLedgerNote(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {/* ── Reason for Modification (Edit Mode Only) ──────────────── */}
            {invoiceToEdit && invoiceToEdit.status !== 'DRAFT' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 mt-4">
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

            {/* ── Zone 3: The Financial HUD (Bottom, Sticky) ───────────────────────────── */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] z-40 p-4 mt-4 -mx-4 md:-mx-1 flex flex-col-reverse md:flex-row justify-between items-stretch md:items-end gap-4 rounded-t-xl">
                
                {/* Actions Docked Left */}
                <div className="flex items-center gap-3 pb-1 justify-between md:justify-start">
                    <Button
                        type="button" variant="outline" size="sm"
                        className="flex-1 md:flex-none gap-1.5 text-slate-500 hover:text-slate-700 h-10"
                        onClick={saveDraft}
                        title="Shortcut: Alt + S"
                    >
                        <Save className="h-4 w-4" /> Save Draft <span className="text-[10px] text-slate-400 ml-1 border rounded px-1 hidden md:inline">Alt+S</span>
                    </Button>
                    <Button type="button" variant="outline" onClick={onSuccess} className="flex-1 md:flex-none h-10">
                        <X className="mr-1 h-4 w-4" /> Cancel
                    </Button>
                </div>

                {/* Receipt Summary & Main Save Button Docked Right */}
                <div className="flex flex-col md:flex-row gap-4 items-stretch">
                    <div className="w-full md:w-72 flex flex-col gap-1.5 text-sm bg-slate-50 p-3 rounded-lg border border-slate-200">
                        {totalTradeDisc + totalCashDisc > 0 && (
                            <div className="flex justify-between text-slate-500 text-xs">
                                <span>Item Discounts</span>
                                <span className="font-mono">− {fmt(totalTradeDisc + totalCashDisc)}</span>
                            </div>
                        )}
                        {invoiceDiscount > 0 && (
                            <div className="flex justify-between text-emerald-600 text-xs">
                                <span>Invoice Discount</span>
                                <span className="font-mono">− {fmt(invoiceDiscount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-slate-600">
                            <span>Taxable Value</span>
                            <span className="font-mono">{fmt(taxableValue)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                            <span>Total GST</span>
                            <span className="font-mono">{fmt(totalGST)}</span>
                        </div>
                        {ledgerAdjustment > 0 && (
                            <div className={`flex justify-between ${adjustmentSign === '-' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                <span>Adjustment</span>
                                <span className="font-mono">{adjustmentSign === '-' ? '−' : '+'} {fmt(ledgerAdjustment)}</span>
                            </div>
                        )}
                        <Separator className="my-1 border-slate-300" />
                        <div className="flex items-end justify-between">
                            <span className="text-sm font-bold text-slate-800">NET PAYABLE</span>
                            <span className="font-mono text-xl font-bold text-slate-900 leading-none">
                                {fmt(netPayable)}
                            </span>
                        </div>
                        {watchedPurchaseType === 'credit' && (
                            <p className="text-right text-[10px] text-slate-400 mt-0.5">
                                Due: {watch('dueDate') ?? '—'}
                            </p>
                        )}
                    </div>
                    
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="h-14 md:h-auto min-h-full w-full md:w-32 flex flex-col gap-1 justify-center rounded-lg shadow-sm"
                        title="Shortcut: Ctrl + Enter"
                    >
                        <span className="text-sm font-semibold">{isSubmitting ? 'Saving...' : (invoiceToEdit && invoiceToEdit.status !== 'DRAFT') ? 'Update' : 'Save'}</span>
                        <span className="text-[10px] font-normal opacity-80 bg-black/20 rounded px-1.5 py-0.5 hidden md:inline-block">Ctrl + Enter</span>
                    </Button>
                </div>
            </div>

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
