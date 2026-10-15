'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, Search, Save } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useOutletId } from '@/hooks/useOutletId';
import { voucherApi, customersApi, salesApi } from '@/lib/apiClient';
import { cn } from '@/lib/utils';
import { useSaleReturnCart, ReturnItemRow, calcItemTotal } from '@/hooks/useSaleReturnCart';
import { SaleReturnItemsGrid } from '@/components/accounts/SaleReturnItemsGrid';

function NewCreditNoteContent() {
    const outletId = useOutletId();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [customers, setCustomers] = useState<any[]>([]);
    const [customerId, setCustomerId] = useState('');
    const [reason, setReason] = useState('');
    const [refundMode, setRefundMode] = useState<'cash' | 'upi' | 'credit_note' | 'adjust'>('cash');
    const {
        items,
        setItems,
        updateItem: updateCartItem,
        updateItemMultiple,
        addItem,
        removeItem,
        subtotal,
        gstAmount,
        totalAmount,
    } = useSaleReturnCart();
    const [saving, setSaving] = useState(false);
    const [existingReturnId, setExistingReturnId] = useState<string | undefined>();
    const [originalSaleId, setOriginalSaleId] = useState('');
    
    // Invoice search state
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoiceResults, setInvoiceResults] = useState<any[]>([]);
    const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!outletId) return;
        customersApi.list(outletId).then((res: any) => setCustomers(res?.data ?? res ?? [])).catch(() => {});
    }, [outletId]);

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
        const urlInvoiceId = searchParams.get('invoiceId');
        if (urlInvoiceId && outletId) {
            salesApi.getById(urlInvoiceId, outletId)
                .then((inv) => {
                    handleSelectInvoice(inv);
                })
                .catch(() => {
                    toast({ variant: 'destructive', title: 'Failed to load invoice', description: 'Could not find the original invoice.' });
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
            const res = await voucherApi.searchSaleInvoices(outletId, q);
            const list = res?.data ?? res ?? [];
            setInvoiceResults(list);
            setShowInvoiceDropdown(list.length > 0);
        } catch {
            setInvoiceResults([]);
        } finally {
            setSearchLoading(false);
        }
    }

    function handleSelectInvoice(inv: any) {
        setCustomerId(inv.customerId || '');
        setOriginalSaleId(inv.id);
        const cName = inv.customerName || inv.customer?.name || 'Walk-in';
        setInvoiceSearch(`${inv.invoiceNo} — ${cName}`);
        setShowInvoiceDropdown(false);
        if (inv.items && inv.items.length > 0) {
            const newItems: any[] = [];
            inv.items.forEach((item: any) => {
                const packSize = item.packSize || 1;
                const maxUnits = ((item.qtyStrips || 0) * packSize + (item.qtyLoose || 0)) - (item.qtyReturned || 0);
                
                // Only add item if there are units available to return
                if (maxUnits > 0) {
                    const remainingStrips = Math.floor(maxUnits / packSize);
                    const remainingLoose = maxUnits % packSize;
                    
                    const canonicalTotal = typeof item.totalAmount === 'number' ? item.totalAmount
                        : calcItemTotal(String(remainingStrips), String(remainingLoose), String(item.rate), packSize);
                    
                    newItems.push({
                        id: Math.random().toString(36).slice(2),
                        saleItemId: item.saleItemId || item.id,
                        batchId: item.batchId || item.batch_id || item.batch?.id || '',
                        alreadyReturned: item.qtyReturned || 0,
                        productName: item.productName || item.name,
                        batchNo: item.batchNo || '',
                        qtyStrips: String(remainingStrips),
                        qtyLoose: String(remainingLoose),
                        packSize,
                        rate: String(item.rate),
                        gstRate: String(item.gstRate),
                        maxTotalUnits: maxUnits,
                        invoiceTotal: canonicalTotal,
                        total: canonicalTotal,
                    });
                }
            });
            setItems(newItems);
            setExistingReturnId(inv.existingReturnId);
        } else if (inv.isDaybook || !inv.items || inv.items.length === 0) {
            setItems([{
                id: Math.random().toString(36).slice(2),
                saleItemId: '',
                batchId: '',
                alreadyReturned: 0,
                productName: '',
                batchNo: '',
                qtyStrips: '1',
                qtyLoose: '0',
                packSize: 1,
                rate: '',
                gstRate: String(inv.defaultGstRate || '18'),
                maxTotalUnits: 999999,
                invoiceTotal: 0,
                total: 0,
            }]);
            if (!reason) {
                setReason(`Return against Daybook Bill #${inv.invoiceNo}`);
            }
        }
    }

    const updateItem = (id: string, field: keyof ReturnItemRow, value: string) => {
        updateCartItem(id, field, value, () => {
            toast({ variant: 'destructive', title: 'Exceeds original invoice quantity!' });
        });
    };

    async function handleSave() {
        if (!outletId) return;
        
        const validItems = items.filter((i) => {
            const qs = parseFloat(i.qtyStrips) || 0;
            const ql = parseFloat(i.qtyLoose) || 0;
            return (qs > 0 || ql > 0) && parseFloat(i.rate) >= 0;
        });

        if (validItems.length === 0) {
            toast({ variant: 'destructive', title: 'Add at least one item with valid quantity' });
            return;
        }

        setSaving(true);
        try {
            if (existingReturnId) {
                await voucherApi.updateSalesReturn(existingReturnId, {
                    outletId,
                    items: validItems.map((i) => ({
                        sale_item_id: i.saleItemId,
                        qty_strips: parseInt(i.qtyStrips, 10) || 0,
                        qty_loose: parseInt(i.qtyLoose, 10) || 0,
                    })),
                });
                toast({ title: 'Return Appended', description: 'Stock has been adjusted successfully' });
                router.push(`/dashboard/accounts/sale-returns/${existingReturnId}`);
            } else {
                const payload = {
                    outletId,
                    outlet_id: outletId,
                    originalSaleId: originalSaleId || undefined,
                    original_sale_id: originalSaleId || undefined,
                    customerId: customerId || undefined,
                    customer_id: customerId || undefined,
                    returnDate: date ? new Date(date).toISOString() : new Date().toISOString(),
                    return_date: date,
                    reason,
                    overrideReason: reason,
                    refundMode,
                    refund_mode: refundMode,
                    items: validItems.map((i) => {
                        const packSize = i.packSize || 1;
                        const qs = parseInt(i.qtyStrips, 10) || 0;
                        const ql = parseInt(i.qtyLoose, 10) || 0;
                        const totalUnits = qs * packSize + ql;
                        const rateNum = parseFloat(i.rate) || 0;
                        const gstRateNum = parseFloat(i.gstRate) || 0;

                        return {
                            saleItemId: i.saleItemId || undefined,
                            sale_item_id: i.saleItemId || undefined,
                            batchId: i.batchId || undefined,
                            batch_id: i.batchId || undefined,
                            qtyReturned: totalUnits,
                            qty_returned: totalUnits,
                            qty: totalUnits,
                            qtyStrips: qs,
                            qty_strips: qs,
                            qtyLoose: ql,
                            qty_loose: ql,
                            packSize,
                            pack_size: packSize,
                            returnRate: rateNum,
                            return_rate: rateNum,
                            rate: rateNum,
                            gstRate: gstRateNum,
                            gst_rate: gstRateNum,
                        };
                    }),
                };
                await salesApi.createReturn(payload);
                toast({ title: 'Sale return recorded', description: 'Stock returned and credit applied' });
                router.push('/dashboard/accounts/sale-returns');
            }
        } catch (error: any) {
            console.error('Save Return Error:', error);
            const msg = error.error?.message || error.detail || error.message || 'Unknown error occurred. Please check console.';
            toast({ variant: 'destructive', title: 'Failed to save return', description: msg });
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
                        <Link href="/dashboard/accounts/sale-returns">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold text-slate-800 leading-none">New Sale Return</h1>
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                Credit Note
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Accept returned goods from customer &amp; restore inventory
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild disabled={saving} className="h-8 text-xs">
                        <Link href="/dashboard/accounts/sale-returns">Cancel</Link>
                    </Button>
                    <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs min-w-[140px] font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700">
                        {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        Save &amp; Return Stock
                    </Button>
                </div>
            </div>

            {/* Compressed Context Strip (Receipt Header) */}
            <div className="w-full rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3" ref={dropdownRef}>
                    {/* Field 1: Invoice Search */}
                    <div className="space-y-1 relative">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Link Sale Invoice
                        </label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                className="pl-8 h-8 text-xs bg-slate-50/70 border-slate-200 focus-visible:bg-white"
                                placeholder="Search Invoice No. or Customer..."
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
                                                <span className="font-semibold text-xs text-slate-800">{inv.invoiceNo}</span>
                                                {inv.isDaybook && (
                                                    <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200">
                                                        Daybook
                                                    </span>
                                                )}
                                                <span className="text-[11px] text-slate-500 ml-2">{inv.customerName}</span>
                                            </div>
                                            <div className="text-right text-[11px] font-mono font-medium text-slate-700">
                                                ₹{inv.grandTotal?.toFixed(2)}
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
                            Return Date
                        </label>
                        <Input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="h-8 text-xs bg-slate-50/70 border-slate-200 focus-visible:bg-white"
                        />
                    </div>

                    {/* Field 3: Customer */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Customer / Account
                        </label>
                        <select
                            value={customerId}
                            onChange={(e) => setCustomerId(e.target.value)}
                            className="w-full h-8 rounded-md border border-slate-200 bg-slate-50/70 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="">Walk-in / Cash Customer</option>
                            {customers.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {existingReturnId && (
                    <div className="mt-2.5 bg-blue-50 border border-blue-200 text-blue-800 px-3 py-1.5 rounded text-xs">
                        <strong>Notice:</strong> This invoice already has an existing return. Any new returned items will be appended as an official revision.
                    </div>
                )}
            </div>

            {/* High-Density POS Returns Items Matrix */}
            <SaleReturnItemsGrid
                items={items}
                onUpdateItem={updateItem}
                onUpdateItemMultiple={updateItemMultiple}
                onAddItem={addItem}
                onRemoveItem={removeItem}
                mode="new"
            />

            {/* Footer Operations & Formal Ledger Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
                {/* Left Rail: Notes & Refund Mode */}
                <div className="lg:col-span-7 space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Reason for Return</Label>
                        <Textarea
                            rows={2}
                            placeholder="e.g. Dispensing error, customer returned sealed strip..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="text-xs resize-none bg-white border-slate-200 focus-visible:ring-blue-500"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Refund Settlement Mode</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                                { value: 'cash', label: 'Cash' },
                                { value: 'upi', label: 'UPI' },
                                { value: 'credit_note', label: 'Credit Note' },
                                { value: 'adjust', label: 'Adjust Dues' },
                            ].map((m) => (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => setRefundMode(m.value as any)}
                                    className={cn(
                                        'rounded border py-1.5 text-xs font-semibold transition-all text-center',
                                        refundMode === m.value
                                            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs ring-1 ring-blue-600'
                                            : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                    )}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Rail: Formal Accounting Ledger Summary Card */}
                <div className="lg:col-span-5 flex justify-end">
                    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs w-full max-w-sm">
                        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Credit Note Ledger</span>
                            <span className="text-[10px] font-mono font-medium text-slate-500">
                                {items.length} {items.length === 1 ? 'Line Item' : 'Line Items'}
                            </span>
                        </div>
                        <div className="p-3 space-y-2 text-xs">
                            <div className="flex justify-between text-slate-600">
                                <span>Taxable Subtotal</span>
                                <span className="font-mono font-semibold text-slate-800">₹{subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                                <span>GST Value (Exact)</span>
                                <span className="font-mono font-semibold text-slate-800">₹{gstAmount.toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="px-3.5 py-2.5 bg-slate-100 border-t-2 border-slate-300 flex justify-between items-baseline">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Net Refund Amount</span>
                            <span className="font-mono text-base font-black text-slate-900">₹{totalAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function NewCreditNotePage() {
    return (
        <Suspense fallback={<div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>}>
            <NewCreditNoteContent />
        </Suspense>
    );
}
