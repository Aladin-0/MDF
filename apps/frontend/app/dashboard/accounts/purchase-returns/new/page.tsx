'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, Search, Save, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { voucherApi, distributorsApi } from '@/lib/apiClient';
import { Distributor } from '@/types';
import { usePurchaseReturnCart, PurchaseReturnItemRow } from '@/hooks/usePurchaseReturnCart';
import { PurchaseReturnItemsGrid } from '@/components/accounts/PurchaseReturnItemsGrid';

function NewDebitNoteContent() {
    const outletId = useOutletId();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [distributors, setDistributors] = useState<Distributor[]>([]);
    const [distributorId, setDistributorId] = useState('');
    const [reason, setReason] = useState('');
    const [revisionReasonCode, setRevisionReasonCode] = useState('');
    const [revisionReasonText, setRevisionReasonText] = useState('');
    const [saving, setSaving] = useState(false);
    const [existingReturnId, setExistingReturnId] = useState<string | undefined>();
    const [purchaseInvoiceId, setPurchaseInvoiceId] = useState<string | undefined>();

    const {
        items,
        setItems,
        updateItem: updateCartItem,
        addItem,
        removeItem,
        subtotal,
        gstAmount,
        totalAmount,
    } = usePurchaseReturnCart();

    // Invoice search state
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceResults, setInvoiceResults] = useState<any[]>([]);
    const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!outletId) return;
        distributorsApi.list(outletId).then(setDistributors).catch(() => {});
    }, [outletId]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowInvoiceDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Handle auto-load from URL
    useEffect(() => {
        const urlInvoiceNo = searchParams.get('invoiceNo');
        const editId = searchParams.get('editId');
        
        // If an editId was passed, redirect directly to the new full-page edit route!
        if (editId) {
            router.replace(`/dashboard/accounts/purchase-returns/${editId}/edit`);
            return;
        }

        if (urlInvoiceNo && outletId) {
            handleInvoiceSearch(urlInvoiceNo).then((results) => {
                if (results && results.length > 0) {
                    const match = results.find((r: any) => r.invoiceNo === urlInvoiceNo) || results[0];
                    handleSelectInvoice(match);
                } else {
                    toast({
                        variant: 'destructive',
                        title: 'Invoice not found',
                        description: `Could not find invoice ${urlInvoiceNo}.`,
                    });
                }
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, outletId]);

    async function handleInvoiceSearch(q: string) {
        setInvoiceSearch(q);
        if (!q.trim() || !outletId) {
            setInvoiceResults([]);
            setShowInvoiceDropdown(false);
            return;
        }
        setSearchLoading(true);
        try {
            const results = await voucherApi.searchPurchaseInvoices(outletId, q);
            setInvoiceResults(results);
            setShowInvoiceDropdown(results.length > 0);
            return results;
        } catch {
            setInvoiceResults([]);
            return [];
        } finally {
            setSearchLoading(false);
        }
    }

    function handleSelectInvoice(inv: any) {
        setDistributorId(inv.distributorId);
        setPurchaseInvoiceId(inv.id);
        setInvoiceSearch(`${inv.invoiceNo} — ${inv.distributorName}`);
        setShowInvoiceDropdown(false);

        if (inv.items && inv.items.length > 0) {
            setItems(
                inv.items.map((item: any) => {
                    const packSize = item.packSize || 1;
                    const maxAllowed = item.availableQty !== undefined 
                        ? Math.min(Number(item.qty), Number(item.availableQty)) 
                        : Number(item.qty);

                    return {
                        id: Math.random().toString(36).slice(2),
                        batchId: item.batchId || '',
                        productName: item.productName,
                        batchNo: item.batchNo || '',
                        expiryDate: item.expiryDate || '',
                        packSize,
                        qtyStrips: String(maxAllowed),
                        qtyLoose: '0',
                        rate: String(item.rate),
                        gstRate: String(item.gstRate || 0),
                        maxTotalUnits: maxAllowed * packSize,
                        total: 0,
                        reason: 'damaged',
                    };
                })
            );
            setExistingReturnId(inv.existingReturnId);
        }
    }

    const handleUpdateItem = (id: string, field: keyof PurchaseReturnItemRow, value: string) => {
        updateCartItem(id, field, value, (maxUnits, enteredUnits) => {
            toast({
                variant: 'destructive',
                title: 'Quantity Exceeded',
                description: `Entered quantity (${enteredUnits} units) exceeds available maximum (${maxUnits} units).`,
            });
        });
    };

    async function handleSave() {
        if (!outletId || !distributorId) {
            toast({ variant: 'destructive', title: 'Select a distributor' });
            return;
        }
        if (!reason.trim()) {
            toast({ variant: 'destructive', title: 'Enter a reason for return' });
            return;
        }

        const validItems = items.filter((i) => {
            const qs = parseFloat(i.qtyStrips) || 0;
            const ql = parseFloat(i.qtyLoose) || 0;
            return i.productName && (qs > 0 || ql > 0) && parseFloat(i.rate) >= 0;
        });

        if (validItems.length === 0) {
            toast({ variant: 'destructive', title: 'Add at least one item with valid quantity' });
            return;
        }

        setSaving(true);
        try {
            if (existingReturnId) {
                if (!revisionReasonCode) {
                    toast({ variant: 'destructive', title: 'Select a reason for modification' });
                    setSaving(false);
                    return;
                }
                if (!revisionReasonText || revisionReasonText.length < 5) {
                    toast({ variant: 'destructive', title: 'Provide details for modification (min 5 characters)' });
                    setSaving(false);
                    return;
                }

                await voucherApi.updateDebitNote(existingReturnId, {
                    outletId,
                    date,
                    distributor_id: distributorId,
                    purchase_invoice_id: purchaseInvoiceId,
                    reason,
                    subtotal,
                    gst_amount: gstAmount,
                    total_amount: totalAmount,
                    revisionReasonCode,
                    revisionReasonText,
                    items: validItems.map((i) => {
                        const qs = parseFloat(i.qtyStrips) || 0;
                        const ql = parseFloat(i.qtyLoose) || 0;
                        const ps = i.packSize || 1;
                        return {
                            batch_id: i.batchId || '00000000-0000-0000-0000-000000000000',
                            product_name: i.productName,
                            qty: qs + (ql / ps),
                            rate: parseFloat(i.rate),
                            gst_rate: parseFloat(i.gstRate) || 0,
                            total: i.total,
                        };
                    }),
                });
                toast({ title: 'Return Appended', description: 'Stock has been adjusted successfully' });
                router.push('/dashboard/accounts/purchase-returns');
            } else {
                await voucherApi.createDebitNote({
                    outletId,
                    date,
                    distributor_id: distributorId,
                    purchase_invoice_id: purchaseInvoiceId,
                    reason,
                    subtotal,
                    gst_amount: gstAmount,
                    total_amount: totalAmount,
                    items: validItems.map((i) => {
                        const qs = parseFloat(i.qtyStrips) || 0;
                        const ql = parseFloat(i.qtyLoose) || 0;
                        const ps = i.packSize || 1;
                        return {
                            batch_id: i.batchId || '00000000-0000-0000-0000-000000000000',
                            product_name: i.productName,
                            qty: qs + (ql / ps),
                            rate: parseFloat(i.rate),
                            gst_rate: parseFloat(i.gstRate) || 0,
                            total: i.total,
                        };
                    }),
                });
                toast({ title: 'Debit note created', description: 'Debit note created and stock updated' });
                router.push('/dashboard/accounts/purchase-returns');
            }
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Failed to save debit note',
                description: err?.detail || err?.message || String(err),
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="w-full max-w-[1800px] mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-4">
            {/* Compressed Top Navigation Bar with Inline Primary Actions */}
            <div className="w-full flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <Link href="/dashboard/accounts/purchase-returns">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold text-slate-800 leading-none">New Purchase Return</h1>
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                Debit Note
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Create a debit note to return goods to distributor
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild disabled={saving} className="h-8 text-xs">
                        <Link href="/dashboard/accounts/purchase-returns">Cancel</Link>
                    </Button>
                    <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs min-w-[140px] font-semibold gap-1.5 bg-purple-700 hover:bg-purple-800 text-white">
                        {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        Create Return
                    </Button>
                </div>
            </div>

            {/* Compressed Context Strip (Receipt Header) */}
            <div className="w-full rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3" ref={dropdownRef}>
                    {/* Field 1: Invoice Search Bar */}
                    <div className="space-y-1 relative">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Link Purchase Invoice
                        </label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                className="pl-8 h-8 text-xs bg-slate-50/70 border-slate-200 focus-visible:bg-white"
                                placeholder="Search Invoice No. or Distributor..."
                                value={invoiceSearch}
                                onChange={(e) => handleInvoiceSearch(e.target.value)}
                                onFocus={() => invoiceResults.length > 0 && setShowInvoiceDropdown(true)}
                            />
                            {searchLoading && (
                                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
                            )}
                        </div>

                        {showInvoiceDropdown && invoiceResults.length > 0 && (
                            <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto left-0">
                                {invoiceResults.map((inv: any) => (
                                    <button
                                        key={inv.id}
                                        type="button"
                                        onClick={() => handleSelectInvoice(inv)}
                                        className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="font-semibold text-xs text-slate-800">Invoice #{inv.invoiceNo}</span>
                                                <span className="text-[11px] text-slate-500 ml-2">{inv.distributorName}</span>
                                            </div>
                                            <div className="text-right text-[11px] font-mono text-slate-500">
                                                {inv.date}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Field 2: Date */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Debit Note Date
                        </label>
                        <Input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="h-8 text-xs bg-slate-50/70 border-slate-200 focus-visible:bg-white"
                        />
                    </div>

                    {/* Field 3: Distributor */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Distributor / Supplier <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={distributorId}
                            onChange={(e) => setDistributorId(e.target.value)}
                            className="w-full h-8 rounded-md border border-slate-200 bg-slate-50/70 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                            <option value="">Select distributor...</option>
                            {distributors.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {existingReturnId && (
                    <div className="mt-2.5 p-3 rounded-md border border-amber-200 bg-amber-50/50 space-y-2">
                        <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs uppercase tracking-wider">
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                            <span>Modification for Existing Return Linked</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-amber-950">
                                    Reason Code <span className="text-red-600">*</span>
                                </Label>
                                <select
                                    className="w-full h-8 rounded-md border border-amber-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    value={revisionReasonCode}
                                    onChange={(e) => setRevisionReasonCode(e.target.value)}
                                >
                                    <option value="">Select a reason...</option>
                                    <option value="defective">Defective / Damaged</option>
                                    <option value="wrong_item">Wrong Item</option>
                                    <option value="pricing_error">Pricing Error</option>
                                    <option value="quantity_correction">Quantity Correction</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-amber-950">
                                    Modification Details <span className="text-red-600">*</span>
                                </Label>
                                <Input
                                    placeholder="Explain why this return is being appended..."
                                    value={revisionReasonText}
                                    onChange={(e) => setRevisionReasonText(e.target.value)}
                                    className="h-8 bg-white text-xs border-amber-200 focus-visible:ring-amber-500"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* High-Density POS Returns Items Matrix */}
            <PurchaseReturnItemsGrid
                items={items}
                onUpdateItem={handleUpdateItem}
                onAddItem={() => addItem()}
                onRemoveItem={removeItem}
                mode="new"
                readOnlyProductInfo={false}
                allowAddItem={true}
            />

            {/* Footer Operations & Formal Ledger Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
                {/* Left Rail: Reason for Return */}
                <div className="lg:col-span-7 space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Reason for Return <span className="text-red-500">*</span></Label>
                    <Textarea
                        rows={3}
                        placeholder="e.g. Damaged packaging, expired batch, wrong item delivered..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="text-xs resize-none bg-white border-slate-200 focus-visible:ring-purple-500"
                    />
                </div>

                {/* Right Rail: Formal Accounting Ledger Summary Card */}
                <div className="lg:col-span-5 flex justify-end">
                    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs w-full max-w-sm">
                        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Debit Note Ledger</span>
                            <span className="text-[10px] font-mono font-medium text-slate-500">
                                {items.length} {items.length === 1 ? 'Line Item' : 'Line Items'}
                            </span>
                        </div>
                        <div className="p-3 space-y-2 text-xs">
                            <div className="flex justify-between text-slate-600">
                                <span>Subtotal (Taxable Value)</span>
                                <span className="font-mono font-semibold text-slate-800">₹{subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                                <span>GST Value (Exclusive)</span>
                                <span className="font-mono font-semibold text-slate-800">₹{gstAmount.toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="px-3.5 py-2.5 bg-slate-100 border-t-2 border-slate-300 flex justify-between items-baseline">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Total Debit Amount</span>
                            <span className="font-mono text-base font-black text-slate-900">₹{totalAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function NewDebitNotePage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        }>
            <NewDebitNoteContent />
        </Suspense>
    );
}
